from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from scripts.train_transformer_genre_model import classification_metrics, prepare_genre_targets, text_inputs


def test_transformer_inputs_contain_only_title_and_synopsis():
    frame = pd.DataFrame([
        {"title": "Echo", "overview": "A distant signal", "genre_names": ["Science Fiction"]},
        {"title": "Mask", "overview": "A hidden identity", "genre_names": ["Thriller"]},
    ])
    assert text_inputs(frame) == ["Echo. A distant signal", "Mask. A hidden identity"]


def test_multilabel_targets_filter_rare_labels_and_empty_synopses():
    frame = pd.DataFrame([
        {"title": "A", "overview": "Plot a", "genre_names": ["Drama", "Mystery"]},
        {"title": "B", "overview": "Plot b", "genre_names": ["Drama", "Mystery"]},
        {"title": "C", "overview": "Plot c", "genre_names": ["Drama", "Thriller"]},
        {"title": "D", "overview": "Plot d", "genre_names": ["Drama", "Thriller"]},
        {"title": "Empty", "overview": "", "genre_names": ["Drama", "Mystery"]},
        {"title": "E", "overview": "Plot e", "genre_names": ["Rare"]},
    ])
    cleaned, targets, classes, support = prepare_genre_targets(frame, min_support=2)
    assert classes == ["Drama", "Mystery", "Thriller"]
    assert support == 2
    assert len(cleaned) == 4
    assert targets.shape == (4, 3)
    assert targets.dtype == np.float32


def test_transformer_metrics_are_finite_and_bounded():
    truth = np.array([[1, 0], [0, 1], [1, 1]], dtype=np.int32)
    probabilities = np.array([[0.9, 0.1], [0.2, 0.8], [0.7, 0.6]])
    metrics = classification_metrics(truth, probabilities, threshold=0.5)
    assert metrics["micro_f1"] == pytest.approx(1.0)
    assert 0.0 <= metrics["macro_f1"] <= 1.0
    assert 0.0 <= metrics["micro_precision"] <= 1.0
    assert 0.0 <= metrics["micro_recall"] <= 1.0
