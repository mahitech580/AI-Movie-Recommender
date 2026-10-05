from __future__ import annotations

import math
from datetime import date
from typing import Any

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.neighbors import NearestNeighbors

EVENT_WEIGHTS = {"open":0.7,"search":0.45,"list":1.25,"similar":0.85,"play":1.5,"mood":0.55}

class HybridRecommender:
    def __init__(self, movies: list[dict[str, Any]]):
        self.movies = movies
        self.by_id = {int(m["id"]): m for m in movies}
        self.vectorizer = TfidfVectorizer(
            lowercase=True, stop_words="english",
            ngram_range=(1,2), sublinear_tf=True, min_df=1
        )
        self.matrix = self.vectorizer.fit_transform([self._text(m) for m in movies])
        self.neighbors = NearestNeighbors(
            metric="cosine", algorithm="brute",
            n_neighbors=min(20, max(2, len(movies)))
        ).fit(self.matrix)

    @staticmethod
    def _text(m: dict) -> str:
        return " ".join([
            str(m.get("title","")),
            " ".join(m.get("genres",[]) or []),
            " ".join(m.get("tags",[]) or []),
            str(m.get("overview","")),
            str(m.get("language",""))
        ])

    def _idx(self, movie_id: int):
        for i,m in enumerate(self.movies):
            if int(m["id"]) == int(movie_id):
                return i
        return None

    def nearest(self, movie_id: int, limit: int = 12):
        idx = self._idx(movie_id)
        if idx is None:
            return []
        distances, indices = self.neighbors.kneighbors(
            self.matrix[idx], n_neighbors=min(limit+1, len(self.movies))
        )
        result=[]
        for distance,row_index in zip(distances[0],indices[0]):
            movie=self.movies[int(row_index)]
            if int(movie["id"])==int(movie_id): continue
            result.append({**movie,"similarity":round(float(1-distance),4)})
            if len(result)>=limit: break
        return result

    @staticmethod
    def _quality(m: dict) -> float:
        r=float(m.get("rating",0) or 0); v=float(m.get("votes",0) or 0)
        return (((v/(v+500))*r)+((500/(v+500))*7))/10

    @staticmethod
    def _popularity(m: dict) -> float:
        return min(1,math.log1p(max(0,float(m.get("popularity",0) or 0)))/6.5)

    @staticmethod
    def _freshness(m: dict) -> float:
        raw=str(m.get("release_date","") or "")
        if not raw:
            raw=f'{m.get("year","2000")}-07-01'
        try:
            age=max(0,(date.today()-date.fromisoformat(raw)).days)
            return max(0,1-min(age,3650)/3650)
        except ValueError:
            return .2

    def _collab_scores(self, user_id: str, interactions: list[dict]) -> dict[int,float]:
        user_items: dict[str,set[int]]={}
        for e in interactions:
            user_items.setdefault(str(e["user_id"]),set()).add(int(e["movie_id"]))
        target=user_items.get(str(user_id),set())
        scores={int(m["id"]):0.0 for m in self.movies}
        for items in user_items.values():
            overlap=len(target & items)
            if not overlap: continue
            for mid in items-target:
                scores[mid]+=min(1.0,overlap/3)
        mx=max(scores.values(),default=1)
        return {k:(v/mx if mx else 0) for k,v in scores.items()}

    def recommend(self,user_id:str,interactions:list[dict],seed_movie_id:int|None=None,limit:int=12):
        profile=[e for e in interactions if str(e["user_id"])==str(user_id)]
        seen={int(e["movie_id"]) for e in profile}
        collab=self._collab_scores(user_id,interactions)
        seed_idx=self._idx(seed_movie_id) if seed_movie_id else None
        seed_vec=self.matrix[seed_idx] if seed_idx is not None else None

        vectors=[]; weights=[]
        for e in profile[-40:]:
            idx=self._idx(int(e["movie_id"]))
            if idx is None: continue
            w=EVENT_WEIGHTS.get(e["event_type"],.25)*float(e.get("value",1) or 1)
            vectors.append(self.matrix[idx].multiply(w)); weights.append(w)

        profile_vec=None
        if vectors:
            profile_vec=vectors[0]
            for v in vectors[1:]: profile_vec=profile_vec+v
            profile_vec=profile_vec.multiply(1/max(sum(weights),1e-9))

        ranked=[]
        for idx,m in enumerate(self.movies):
            mid=int(m["id"])
            if seed_movie_id and mid==int(seed_movie_id): continue
            vec=self.matrix[idx]
            p=float(cosine_similarity(vec,profile_vec)[0][0]) if profile_vec is not None else 0
            s=float(cosine_similarity(vec,seed_vec)[0][0]) if seed_vec is not None else 0
            genre=0
            if seed_movie_id:
                a={x.lower() for x in self.by_id[int(seed_movie_id)].get("genres",[])}
                b={x.lower() for x in m.get("genres",[])}
                genre=min(1,len(a & b)/3)
            quality=self._quality(m); pop=self._popularity(m); fresh=self._freshness(m)
            novelty=0 if mid in seen else 1
            score=.34*p+.17*s+.11*genre+.10*quality+.07*pop+.05*fresh+.08*novelty+.08*collab.get(mid,0)
            ranked.append({
                **m,"score":round(score,6),
                "match":int(max(55,min(99,round(score*125)))),
                "reason":self.reason(p,s,collab.get(mid,0),genre,quality,novelty)
            })
        ranked.sort(key=lambda x:x["score"],reverse=True)
        result=[]; counts={}
        for m in ranked:
            primary=str((m.get("genres") or ["Movie"])[0]).lower()
            if counts.get(primary,0)>=4 and len(result)<limit-2: continue
            result.append(m); counts[primary]=counts.get(primary,0)+1
            if len(result)>=limit: break
        return result

    @staticmethod
    def reason(profile,seed,collab,genre,quality,novelty):
        if collab>.35: return "Also liked by users with overlapping taste signals"
        if seed>.45: return "Strong content similarity to your selected title"
        if profile>.35: return "Matches the taste profile learned from your activity"
        if genre>.33: return "Shares multiple genre signals with your current discovery"
        if quality>.84: return "High quality signal with strong rating confidence"
        if novelty: return "Exploration pick designed to broaden your queue"
        return "Balanced hybrid score across content, quality and popularity"
