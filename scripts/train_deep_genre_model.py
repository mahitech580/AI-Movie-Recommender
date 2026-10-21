"""Optional TensorFlow/Keras multi-label synopsis-to-genre model with CNN + BiLSTM layers."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import MultiLabelBinarizer

from scripts.train_predictive_models import DEFAULT_SOURCE, load_dataset

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "reports" / "deep_genre_metrics.json"
ARTIFACT_DIR = ROOT / ".cache" / "deep_genre"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-path", type=Path)
    parser.add_argument("--epochs", type=int, default=6)
    parser.add_argument("--max-rows", type=int, default=0, help="Optional development cap; 0 uses all rows.")
    args = parser.parse_args()

    import tensorflow as tf
    from tensorflow import keras
    from tensorflow.keras.preprocessing.sequence import pad_sequences
    from tensorflow.keras.preprocessing.text import Tokenizer

    tf.keras.utils.set_random_seed(42)
    frame = load_dataset(args.dataset_path, DEFAULT_SOURCE)
    frame["overview"] = frame["overview"].fillna("").astype(str) if "overview" in frame else ""
    frame = frame[frame["overview"].str.strip().ne("")].copy()
    if args.max_rows > 0:
        frame = frame.sort_values("vote_count", ascending=False).head(args.max_rows).copy()
    labels = frame["genre_names"].tolist()
    counts = {}
    for genres in labels:
        for genre in set(genres):
            counts[genre] = counts.get(genre, 0) + 1
    labels = [[g for g in genres if counts.get(g, 0) >= 35] for genres in labels]
    keep = [bool(genres) for genres in labels]
    frame = frame.loc[keep].reset_index(drop=True)
    labels = [genres for genres in labels if genres]
    mlb = MultiLabelBinarizer()
    y = mlb.fit_transform(labels).astype("float32")
    text = (
        frame["title"].fillna("").astype(str) + " " +
        frame["overview"].fillna("").astype(str) + " " +
        frame["genre_names"].apply(lambda values: " ".join(values))
    ).tolist()
    tokenizer = Tokenizer(num_words=30000, oov_token="<OOV>")
    tokenizer.fit_on_texts(text)
    sequences = tokenizer.texts_to_sequences(text)
    padded = pad_sequences(sequences, maxlen=220, padding="post", truncating="post")
    indexes = np.arange(len(text))
    train_idx, test_idx = train_test_split(indexes, test_size=0.2, random_state=42)
    x_train, x_test = padded[train_idx], padded[test_idx]
    y_train, y_test = y[train_idx], y[test_idx]

    model = keras.Sequential([
        keras.layers.Input(shape=(220,)),
        keras.layers.Embedding(input_dim=30000, output_dim=96, mask_zero=False),
        keras.layers.Conv1D(96, 5, activation="relu", padding="same"),
        keras.layers.MaxPooling1D(pool_size=2),
        keras.layers.Bidirectional(keras.layers.LSTM(48, return_sequences=True, dropout=0.15)),
        keras.layers.GlobalMaxPooling1D(),
        keras.layers.Dense(96, activation="relu"),
        keras.layers.Dropout(0.35),
        keras.layers.Dense(y.shape[1], activation="sigmoid"),
    ])
    model.compile(
        optimizer=keras.optimizers.Adam(learning_rate=0.001),
        loss="binary_crossentropy",
        metrics=[keras.metrics.AUC(name="macro_auc", multi_label=True, num_labels=y.shape[1])],
    )
    callbacks = [
        keras.callbacks.EarlyStopping(monitor="val_loss", patience=2, restore_best_weights=True),
        keras.callbacks.ReduceLROnPlateau(monitor="val_loss", patience=1, factor=0.5),
    ]
    history = model.fit(
        x_train, y_train, validation_split=0.15, epochs=max(1, min(args.epochs, 20)),
        batch_size=32, callbacks=callbacks, verbose=2,
    )
    probabilities = model.predict(x_test, verbose=0)
    predictions = (probabilities >= 0.35).astype("int32")
    metrics = {
        "dataset": "TMDB 5000 Movie Dataset",
        "rows": int(len(frame)), "train_rows": int(len(train_idx)), "test_rows": int(len(test_idx)),
        "genres": mlb.classes_.tolist(),
        "threshold": 0.35,
        "micro_f1": round(float(f1_score(y_test, predictions, average="micro", zero_division=0)), 5),
        "macro_f1": round(float(f1_score(y_test, predictions, average="macro", zero_division=0)), 5),
        "micro_precision": round(float(precision_score(y_test, predictions, average="micro", zero_division=0)), 5),
        "micro_recall": round(float(recall_score(y_test, predictions, average="micro", zero_division=0)), 5),
        "final_train_loss": round(float(history.history["loss"][-1]), 5),
        "best_validation_loss": round(float(min(history.history["val_loss"])), 5),
        "architecture": "Keras Embedding + Conv1D + Bidirectional LSTM + sigmoid multi-label output",
        "note": "Report metrics with dataset size and threshold; results are not comparable across different dataset splits.",
    }
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    model.save(ARTIFACT_DIR / "genre_classifier.keras")
    (ARTIFACT_DIR / "tokenizer.json").write_text(tokenizer.to_json(), encoding="utf-8")
    (ARTIFACT_DIR / "labels.json").write_text(json.dumps(mlb.classes_.tolist(), indent=2), encoding="utf-8")
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metrics, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
