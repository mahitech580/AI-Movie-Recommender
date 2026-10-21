from __future__ import annotations

import math
import pytest

from scripts.evaluate_recommender import dcg_at_k, ndcg_at_k, precision_at_k, recall_at_k


def test_top_k_metrics():
    ranking = [10, 20, 30, 40]
    relevant = {20, 30}
    assert precision_at_k(ranking, relevant, 3) == pytest.approx(2 / 3)
    assert recall_at_k(ranking, relevant, 3) == pytest.approx(1.0)
    assert dcg_at_k(ranking, relevant, 3) == pytest.approx(1 / math.log2(3) + 1 / math.log2(4))
    assert 0 <= ndcg_at_k(ranking, relevant, 3) <= 1


def test_metrics_require_positive_k():
    with pytest.raises(ValueError):
        precision_at_k([1], {1}, 0)
    with pytest.raises(ValueError):
        recall_at_k([1], {1}, 0)
