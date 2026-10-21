"""Fine-tune a PyTorch/Hugging Face transformer for multi-label movie genre prediction.

Uses title and synopsis text only; target genre labels are never included as input features.
The dataset is cached under the ignored .cache/ directory. Metrics are written to reports/.
"""
from __future__ import annotations

import argparse
import json
import os
import random
import time
from collections import Counter
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.metrics import f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import MultiLabelBinarizer

try:
    from scripts.train_predictive_models import DEFAULT_SOURCE, load_dataset
except ModuleNotFoundError:
    from train_predictive_models import DEFAULT_SOURCE, load_dataset

ROOT = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT / "reports" / "transformer_genre_metrics.json"
ARTIFACT_DIR = ROOT / ".cache" / "transformer_genre"


def prepare_genre_targets(
    frame: pd.DataFrame, min_support: int | None = None
) -> tuple[pd.DataFrame, np.ndarray, list[str], int]:
    """Drop empty synopses and rare labels, then build a stable multilabel target matrix."""
    required = {"title", "overview", "genre_names"}
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f"Dataset is missing columns: {', '.join(sorted(missing))}")

    cleaned = frame.copy()
    cleaned["title"] = cleaned["title"].fillna("").astype(str)
    cleaned["overview"] = cleaned["overview"].fillna("").astype(str)
    cleaned = cleaned[cleaned["overview"].str.strip().ne("")].reset_index(drop=True)
    if cleaned.empty:
        raise ValueError("No movies with a non-empty synopsis are available.")

    labels = [
        list(dict.fromkeys(str(genre).strip() for genre in (genres or []) if str(genre).strip()))
        for genres in cleaned["genre_names"]
    ]
    support = Counter(genre for row in labels for genre in set(row))
    threshold = min_support if min_support is not None else max(8, min(35, int(len(cleaned) * 0.01)))
    if threshold < 1:
        raise ValueError("min_support must be a positive integer.")

    classes = sorted(genre for genre, count in support.items() if count >= threshold)
    if len(classes) < 2:
        raise ValueError(
            f"Only {len(classes)} genres meet the minimum support of {threshold}; "
            "use more data or lower the minimum support."
        )

    mlb = MultiLabelBinarizer(classes=classes)
    mlb.fit([classes])
    targets = mlb.transform([[genre for genre in row if genre in classes] for row in labels])
    keep = targets.sum(axis=1) > 0
    cleaned = cleaned.loc[keep].reset_index(drop=True)
    targets = targets[keep].astype(np.float32)
    return cleaned, targets, classes, threshold


def text_inputs(frame: pd.DataFrame) -> list[str]:
    """Only title and synopsis are features; genre labels are never copied into text."""
    return (
        frame["title"].fillna("").astype(str).str.strip()
        + ". "
        + frame["overview"].fillna("").astype(str).str.strip()
    ).tolist()


def classification_metrics(
    truth: np.ndarray, probabilities: np.ndarray, threshold: float = 0.35
) -> dict[str, float]:
    """Return multilabel micro/macro metrics, safely handling labels with no predictions."""
    predictions = (probabilities >= threshold).astype(np.int32)
    return {
        "micro_f1": round(float(f1_score(truth, predictions, average="micro", zero_division=0)), 5),
        "macro_f1": round(float(f1_score(truth, predictions, average="macro", zero_division=0)), 5),
        "micro_precision": round(float(precision_score(truth, predictions, average="micro", zero_division=0)), 5),
        "micro_recall": round(float(recall_score(truth, predictions, average="micro", zero_division=0)), 5),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-path", type=Path)
    parser.add_argument("--source-url", default=DEFAULT_SOURCE)
    parser.add_argument("--model-name", default=os.getenv("CINEPLAY_TRANSFORMER_MODEL", "distilbert/distilbert-base-uncased"))
    parser.add_argument("--epochs", type=int, default=2)
    parser.add_argument("--max-rows", type=int, default=1000, help="Development cap; 0 uses all rows.")
    parser.add_argument("--max-length", type=int, default=192)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--min-support", type=int)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", type=Path, default=REPORT_PATH)
    args = parser.parse_args()
    if not 1 <= args.epochs <= 10:
        raise SystemExit("--epochs must be between 1 and 10")
    if args.max_rows < 0 or args.max_rows in (1, 2):
        raise SystemExit("--max-rows must be 0 or at least 3")
    if not 32 <= args.max_length <= 512:
        raise SystemExit("--max-length must be between 32 and 512")
    if not 1 <= args.batch_size <= 64:
        raise SystemExit("--batch-size must be between 1 and 64")

    import torch
    from torch.utils.data import DataLoader, TensorDataset
    from transformers import AutoModelForSequenceClassification, AutoTokenizer

    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(args.seed)

    started = time.perf_counter()
    frame = load_dataset(args.dataset_path, args.source_url)
    if args.max_rows:
        sort_column = "vote_count" if "vote_count" in frame.columns else "title"
        frame = frame.sort_values(sort_column, ascending=False).head(args.max_rows).copy()
    frame, targets, classes, support_threshold = prepare_genre_targets(frame, args.min_support)

    indices = np.arange(len(frame))
    train_indices, test_indices = train_test_split(indices, test_size=0.2, random_state=args.seed)
    tokenizer = AutoTokenizer.from_pretrained(args.model_name)
    encoded = tokenizer(
        text_inputs(frame), padding="max_length", truncation=True,
        max_length=args.max_length, return_tensors="pt",
    )
    input_ids = encoded["input_ids"]
    attention_mask = encoded["attention_mask"]
    target_tensor = torch.tensor(targets, dtype=torch.float32)
    all_data = TensorDataset(input_ids, attention_mask, target_tensor)
    train_data = torch.utils.data.Subset(all_data, train_indices.tolist())
    test_data = torch.utils.data.Subset(all_data, test_indices.tolist())
    generator = torch.Generator().manual_seed(args.seed)
    train_loader = DataLoader(train_data, batch_size=args.batch_size, shuffle=True, generator=generator)
    test_loader = DataLoader(test_data, batch_size=args.batch_size, shuffle=False)

    model = AutoModelForSequenceClassification.from_pretrained(
        args.model_name, num_labels=len(classes), problem_type="multi_label_classification"
    )
    model.config.problem_type = "multi_label_classification"
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=2e-5, weight_decay=0.01)

    epoch_losses: list[float] = []
    for epoch in range(args.epochs):
        model.train()
        batch_losses: list[float] = []
        for batch_ids, batch_mask, batch_labels in train_loader:
            optimizer.zero_grad(set_to_none=True)
            outputs = model(
                input_ids=batch_ids.to(device),
                attention_mask=batch_mask.to(device),
                labels=batch_labels.to(device),
            )
            outputs.loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            batch_losses.append(float(outputs.loss.detach().cpu()))
        epoch_losses.append(round(float(np.mean(batch_losses)), 5))
        print(f"epoch {epoch + 1}/{args.epochs} loss={epoch_losses[-1]:.5f}")

    model.eval()
    logits, truth_rows = [], []
    with torch.no_grad():
        for batch_ids, batch_mask, batch_labels in test_loader:
            outputs = model(input_ids=batch_ids.to(device), attention_mask=batch_mask.to(device))
            logits.append(outputs.logits.detach().cpu().numpy())
            truth_rows.append(batch_labels.numpy())
    logits_array = np.concatenate(logits, axis=0)
    probabilities = 1.0 / (1.0 + np.exp(-np.clip(logits_array, -60, 60)))
    truth = np.concatenate(truth_rows, axis=0).astype(np.int32)
    transformer_metrics = classification_metrics(truth, probabilities, threshold=0.35)

    train_targets = targets[train_indices]
    baseline_probabilities = np.repeat(
        train_targets.mean(axis=0, keepdims=True), repeats=len(test_indices), axis=0
    )
    baseline_metrics = classification_metrics(truth, baseline_probabilities, threshold=0.5)

    report: dict[str, Any] = {
        "task": "multi-label movie genre prediction from title and synopsis",
        "dataset": "TMDB 5000 Movie Dataset metadata snapshot",
        "source_url": args.source_url,
        "model_name": args.model_name,
        "architecture": "Hugging Face Transformer sequence classifier fine-tuned with PyTorch BCE loss",
        "rows": int(len(frame)), "train_rows": int(len(train_indices)), "test_rows": int(len(test_indices)),
        "genre_count": len(classes), "genres": classes, "minimum_genre_support": int(support_threshold),
        "epochs": int(args.epochs), "batch_size": int(args.batch_size), "max_length": int(args.max_length),
        "random_seed": int(args.seed), "device": str(device), "threshold": 0.35,
        "baseline_majority_prevalence": baseline_metrics,
        "transformer": transformer_metrics,
        "epoch_train_loss": epoch_losses,
        "duration_seconds": round(time.perf_counter() - started, 2),
        "note": "Held-out test results for this split only; record the dataset, split, sample count and threshold when reporting metrics.",
    }

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(ARTIFACT_DIR / "model")
    tokenizer.save_pretrained(ARTIFACT_DIR / "tokenizer")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
