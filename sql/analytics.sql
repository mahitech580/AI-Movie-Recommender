-- CINEPLAY analytics queries. Bind parameters; never concatenate user input.
-- 1) Catalog coverage and central tendency.
SELECT COUNT(*) AS catalog_size,
       AVG(rating) AS average_rating,
       AVG(popularity) AS average_popularity,
       SUM(CASE WHEN poster IS NULL OR poster = '' THEN 1 ELSE 0 END) AS missing_posters,
       SUM(CASE WHEN overview IS NULL OR overview = '' THEN 1 ELSE 0 END) AS missing_overviews
FROM movies;

-- 2) Most active anonymous profiles.
SELECT user_id, COUNT(*) AS event_count, COUNT(DISTINCT movie_id) AS distinct_titles
FROM interactions
GROUP BY user_id
ORDER BY event_count DESC
LIMIT 25;

-- 3) Engagement funnel by event category.
SELECT event_type, COUNT(*) AS events,
       COUNT(DISTINCT user_id) AS active_profiles,
       COUNT(DISTINCT movie_id) AS distinct_titles
FROM interactions
GROUP BY event_type
ORDER BY events DESC;

-- 4) Most-engaged titles with readable catalog names.
SELECT m.id, m.title, COUNT(i.id) AS engagement_events,
       COUNT(DISTINCT i.user_id) AS unique_profiles
FROM movies AS m
JOIN interactions AS i ON i.movie_id = m.id
GROUP BY m.id, m.title
ORDER BY engagement_events DESC
LIMIT 20;

-- 5) Per-profile recency ranking using a window function.
SELECT user_id, movie_id, event_type, value, created_at,
       ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS recency_rank
FROM interactions;

-- 6) Bayesian weighted rating regularized toward the catalog-wide prior.
-- Bind :minimum_votes to a data-calibrated vote threshold.
WITH catalog_prior AS (
    SELECT AVG(rating) AS prior_rating FROM movies
),
scored AS (
    SELECT m.id, m.title, m.rating, m.votes,
           (m.votes * m.rating + :minimum_votes * p.prior_rating)
             / NULLIF(m.votes + :minimum_votes, 0) AS weighted_rating
    FROM movies AS m CROSS JOIN catalog_prior AS p
)
SELECT id, title, rating, votes, weighted_rating
FROM scored
ORDER BY weighted_rating DESC
LIMIT 25;
