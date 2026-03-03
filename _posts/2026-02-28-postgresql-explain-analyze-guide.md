---
layout: post
title: "PostgreSQL EXPLAIN and ANALYZE: A Practical Guide to Query Plans"
date: 2026-02-28
tags: [PostgreSQL, Performance]
read_time: 14
excerpt: "A deep dive into PostgreSQL's EXPLAIN and ANALYZE commands — learn to read query plans, understand node types, spot performance bottlenecks, and optimize slow queries with real-world examples."
---

If your [PostgreSQL](https://www.postgresql.org) queries are slow and you're guessing why, you're doing it wrong. `EXPLAIN` and `ANALYZE` are the tools that show you exactly what the database is doing — which indexes it's using (or ignoring), how it's joining tables, and where time is being spent. This post is a hands-on guide to reading and acting on query plans.

## EXPLAIN vs EXPLAIN ANALYZE

These two commands look similar but are fundamentally different:

```sql
-- Shows the planned execution strategy (does NOT run the query)
EXPLAIN SELECT * FROM orders WHERE status = 'pending';

-- Actually runs the query and shows real execution times
EXPLAIN ANALYZE SELECT * FROM orders WHERE status = 'pending';
```

**`EXPLAIN`** shows the planner's *estimate* — what PostgreSQL *thinks* will happen. It's safe and fast because it never touches the data.

**`EXPLAIN ANALYZE`** *executes* the query and reports actual times and row counts. This is what you need for real performance debugging.

**Warning:** `EXPLAIN ANALYZE` runs the query for real. For `INSERT`, `UPDATE`, or `DELETE`, wrap it in a transaction you roll back:

```sql
BEGIN;
EXPLAIN ANALYZE DELETE FROM logs WHERE created_at < '2025-01-01';
ROLLBACK;
```

## Reading Your First Query Plan

Let's start with a simple example. Assume we have a table:

```sql
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL,
    total NUMERIC(10,2),
    created_at TIMESTAMP DEFAULT now()
);

-- 1 million rows
INSERT INTO orders (customer_id, status, total, created_at)
SELECT
    (random() * 10000)::int,
    (ARRAY['pending','shipped','delivered','cancelled'])[floor(random()*4+1)::int],
    (random() * 500)::numeric(10,2),
    now() - (random() * interval '365 days')
FROM generate_series(1, 1000000);

CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_customer ON orders(customer_id);
```

Now run:

```sql
EXPLAIN ANALYZE SELECT * FROM orders WHERE status = 'pending';
```

Output:

```
Bitmap Heap Scan on orders  (cost=2891.97..15340.57 rows=249750 width=31)
  (actual time=12.451..78.332 rows=250102 loops=1)
  Recheck Cond: ((status)::text = 'pending'::text)
  Heap Blocks: exact=8334
  ->  Bitmap Index Scan on idx_orders_status  (cost=0.00..2829.53 rows=249750 width=0)
      (actual time=11.214..11.214 rows=250102 loops=1)
        Index Cond: ((status)::text = 'pending'::text)
Planning Time: 0.098 ms
Execution Time: 88.645 ms
```

Let's break down every part.

## Anatomy of a Query Plan

### Cost Estimates

```
cost=2891.97..15340.57
```

- **2891.97** — Startup cost (time before the first row is returned)
- **15340.57** — Total cost (time to return all rows)

These are in arbitrary units (not milliseconds). They're useful for *comparing* plans, not for absolute timing.

### Row Estimates vs Actuals

```
rows=249750    -- Planner's estimate
rows=250102    -- Actual rows returned
```

When these diverge significantly, the planner is making decisions based on bad statistics. Run `ANALYZE orders;` to update them.

### Actual Time

```
actual time=12.451..78.332
```

- **12.451 ms** — Time to return the first row
- **78.332 ms** — Time to return all rows

### Loops

```
loops=1
```

How many times this node was executed. In nested loop joins, inner nodes run many times.

## Scan Types

The scan type tells you how PostgreSQL accesses the table data.

### Sequential Scan (Seq Scan)

```sql
EXPLAIN ANALYZE SELECT * FROM orders WHERE total > 100;
```

```
Seq Scan on orders  (cost=0.00..20834.00 rows=666937 width=31)
  (actual time=0.013..112.547 rows=667023 loops=1)
  Filter: (total > 100)
  Rows Removed by Filter: 332977
```

PostgreSQL reads **every row** in the table and applies the filter. This happens when:
- No suitable index exists
- The query returns a large percentage of the table (index would be slower)
- The table is small enough that a sequential scan is faster

**Key indicator:** `Rows Removed by Filter` — if this number is large relative to returned rows, you may need an index.

### Index Scan

```sql
EXPLAIN ANALYZE SELECT * FROM orders WHERE id = 42;
```

```
Index Scan using orders_pkey on orders  (cost=0.42..8.44 rows=1 width=31)
  (actual time=0.021..0.022 rows=1 loops=1)
  Index Cond: (id = 42)
```

Directly looks up the index, then fetches the row from the heap. Ideal for queries returning few rows.

### Index Only Scan

```sql
CREATE INDEX idx_orders_status_total ON orders(status, total);

EXPLAIN ANALYZE SELECT status, total FROM orders WHERE status = 'shipped' AND total > 400;
```

```
Index Only Scan using idx_orders_status_total on orders
  (cost=0.42..1842.93 rows=16650 width=11)
  (actual time=0.031..8.412 rows=16589 loops=1)
  Index Cond: ((status = 'shipped') AND (total > 400))
  Heap Fetches: 0
```

The query is answered entirely from the index — no table heap access needed. `Heap Fetches: 0` confirms this. This is the fastest scan type. It works when all columns in `SELECT` and `WHERE` are in the index.

### Bitmap Index Scan + Bitmap Heap Scan

```sql
EXPLAIN ANALYZE SELECT * FROM orders WHERE status = 'pending';
```

```
Bitmap Heap Scan on orders  (cost=2891.97..15340.57 rows=249750 width=31)
  ->  Bitmap Index Scan on idx_orders_status  (cost=0.00..2829.53 rows=249750 width=0)
        Index Cond: ((status)::text = 'pending'::text)
```

A two-step process:
1. **Bitmap Index Scan** — Scans the index and builds a bitmap of which pages to visit
2. **Bitmap Heap Scan** — Fetches those pages from the table

PostgreSQL uses this when too many rows match for an index scan but not enough to justify a full sequential scan. It's also used to combine multiple indexes with `BitmapAnd` / `BitmapOr`.

## Join Types

### Nested Loop

```sql
EXPLAIN ANALYZE
SELECT o.id, c.name
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.id < 10;
```

```
Nested Loop  (cost=0.72..69.98 rows=9 width=22)
  (actual time=0.028..0.065 rows=9 loops=1)
  ->  Index Scan using orders_pkey on orders o  (cost=0.42..36.61 rows=9 width=8)
        Index Cond: (id < 10)
  ->  Index Scan using customers_pkey on customers c  (cost=0.29..3.71 rows=1 width=18)
        Index Cond: (id = o.customer_id)
        (actual time=0.003..0.003 rows=1 loops=9)
```

For each row from the outer table (`orders`), it looks up the matching row in the inner table (`customers`). Notice `loops=9` on the inner scan — it runs once per outer row. Fast for small result sets with indexed lookups.

### Hash Join

```sql
EXPLAIN ANALYZE
SELECT o.id, c.name
FROM orders o
JOIN customers c ON c.id = o.customer_id;
```

```
Hash Join  (cost=310.00..27584.00 rows=1000000 width=22)
  (actual time=3.812..312.541 rows=1000000 loops=1)
  Hash Cond: (o.customer_id = c.id)
  ->  Seq Scan on orders o  (cost=0.00..18334.00 rows=1000000 width=8)
  ->  Hash  (cost=185.00..185.00 rows=10000 width=18)
        Buckets: 16384  Batches: 1  Memory Usage: 549kB
        ->  Seq Scan on customers c  (cost=0.00..185.00 rows=10000 width=18)
```

Builds a hash table from the smaller table (`customers`), then probes it for each row of the larger table (`orders`). Efficient for large joins where both tables are big.

**Watch for:** `Batches: 1` means the hash fit in memory. If batches > 1, increase `work_mem`.

### Merge Join

```sql
Merge Join  (cost=... rows=...)
  Merge Cond: (o.customer_id = c.id)
  ->  Index Scan using idx_orders_customer on orders o
  ->  Index Scan using customers_pkey on customers c
```

Both inputs are sorted (or come pre-sorted from indexes), then merged in a single pass. Very efficient when both sides are already sorted.

## Aggregation Plans

```sql
EXPLAIN ANALYZE
SELECT status, count(*), avg(total)
FROM orders
GROUP BY status;
```

```
HashAggregate  (cost=23334.00..23334.04 rows=4 width=46)
  (actual time=198.712..198.714 rows=4 loops=1)
  Group Key: status
  Batches: 1  Memory Usage: 24kB
  ->  Seq Scan on orders  (cost=0.00..18334.00 rows=1000000 width=15)
        (actual time=0.011..67.432 rows=1000000 loops=1)
```

`HashAggregate` builds a hash table of groups. With only 4 distinct status values, this is very efficient.

For high-cardinality grouping or sorted output, you'll see `GroupAggregate` with a preceding `Sort` node instead.

## Sorting

```sql
EXPLAIN ANALYZE
SELECT * FROM orders ORDER BY created_at DESC LIMIT 10;
```

```
Limit  (cost=38578.82..38578.85 rows=10 width=31)
  (actual time=178.231..178.234 rows=10 loops=1)
  ->  Sort  (cost=38578.82..41078.82 rows=1000000 width=31)
        (actual time=178.229..178.231 rows=10 loops=1)
        Sort Key: created_at DESC
        Sort Method: top-N heapsort  Memory: 25kB
        ->  Seq Scan on orders  (cost=0.00..18334.00 rows=1000000 width=31)
```

**Watch for:** `Sort Method: external merge  Disk: 25672kB` — this means the sort spilled to disk. Fix it by increasing `work_mem` or adding an index:

```sql
CREATE INDEX idx_orders_created ON orders(created_at DESC);

-- Now the same query:
Limit  (cost=0.42..0.78 rows=10 width=31)
  (actual time=0.023..0.028 rows=10 loops=1)
  ->  Index Scan using idx_orders_created on orders
```

No sort needed — the index provides the rows in order.

## Subquery and CTE Plans

### Subquery

```sql
EXPLAIN ANALYZE
SELECT * FROM orders
WHERE customer_id IN (SELECT id FROM customers WHERE tier = 'premium');
```

```
Hash Semi Join  (cost=189.25..20023.25 rows=50000 width=31)
  Hash Cond: (orders.customer_id = customers.id)
  ->  Seq Scan on orders  (cost=0.00..18334.00 rows=1000000 width=31)
  ->  Hash  (cost=185.00..185.00 rows=340 width=4)
        ->  Seq Scan on customers  (cost=0.00..185.00 rows=340 width=4)
              Filter: (tier = 'premium')
```

PostgreSQL flattened the `IN` subquery into a `Hash Semi Join` — it doesn't execute the subquery separately.

### CTE (Common Table Expressions)

```sql
EXPLAIN ANALYZE
WITH pending_orders AS (
    SELECT * FROM orders WHERE status = 'pending'
)
SELECT customer_id, count(*)
FROM pending_orders
GROUP BY customer_id
ORDER BY count(*) DESC
LIMIT 10;
```

Since PostgreSQL 12, CTEs are inlined by default (not materialized). Add `MATERIALIZED` if you specifically need the CTE to execute once and cache results.

## Useful EXPLAIN Options

```sql
-- Include all details
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM orders WHERE status = 'pending';
```

### BUFFERS

```
Buffers: shared hit=8450 read=12
```

- **shared hit** — Pages found in PostgreSQL's buffer cache (fast)
- **read** — Pages read from disk (slow)

High `read` values indicate cold cache or insufficient `shared_buffers`.

### FORMAT JSON

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT * FROM orders WHERE status = 'pending';
```

Returns structured JSON — useful for programmatic analysis or pasting into visualization tools like [explain.dalibo.com](https://explain.dalibo.com) or [explain.depesz.com](https://explain.depesz.com).

### VERBOSE

```sql
EXPLAIN (VERBOSE)
SELECT * FROM orders WHERE status = 'pending';
```

Shows output columns, schema-qualified table names, and which columns are used from each table.

## Spotting Common Problems

### 1. Bad Row Estimates

```
->  Index Scan on idx_orders_status  (rows=100 ... actual rows=250000)
```

The planner estimated 100 rows but got 250,000. This leads to bad plan choices. Fix: run `ANALYZE orders;` or increase `default_statistics_target`.

### 2. Sequential Scan Where Index Expected

```
Seq Scan on orders  (cost=0.00..18334.00 rows=1000000)
  Filter: (status = 'pending')
```

If an index exists on `status`, the planner chose a seq scan because it estimated too many matching rows. Check with:

```sql
-- Force an index scan temporarily to compare
SET enable_seqscan = off;
EXPLAIN ANALYZE SELECT * FROM orders WHERE status = 'pending';
RESET enable_seqscan;
```

### 3. Disk Sorts

```
Sort Method: external merge  Disk: 25672kB
```

The sort couldn't fit in memory. Options:
- Increase `work_mem` (per-operation setting)
- Add an index that provides the sort order
- Reduce the data set being sorted

### 4. Nested Loop with High Loops

```
->  Index Scan on products  (actual time=0.01..0.01 rows=1 loops=500000)
```

500,000 index lookups. Even at 0.01ms each, that's 5 seconds total. Consider if a hash join would be better — the planner might need updated statistics.

### 5. Lossy Bitmap Scans

```
Bitmap Heap Scan on orders
  Recheck Cond: (status = 'pending')
  Rows Removed by Recheck: 45000
```

When `work_mem` is too low, the bitmap becomes "lossy" — it tracks pages instead of individual rows, requiring rechecks. Increase `work_mem` to avoid this.

## Real-World Optimization Example

Here's a query that's performing poorly:

```sql
EXPLAIN ANALYZE
SELECT o.id, o.total, c.name, c.email
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.status = 'pending'
  AND o.created_at > now() - interval '7 days'
ORDER BY o.created_at DESC;
```

```
Sort  (cost=18921.45..18933.67 rows=4890 width=52)
  (actual time=245.112..245.198 rows=4823 loops=1)
  Sort Key: o.created_at DESC
  Sort Method: quicksort  Memory: 712kB
  ->  Hash Join  (cost=189.00..18632.00 rows=4890 width=52)
        (actual time=2.541..243.871 rows=4823 loops=1)
        Hash Cond: (o.customer_id = c.id)
        ->  Seq Scan on orders o  (cost=0.00..18334.00 rows=4890 width=27)
              (actual time=0.021..241.012 rows=4823 loops=1)
              Filter: (status = 'pending' AND created_at > ...)
              Rows Removed by Filter: 995177
        ->  Hash  (cost=155.00..155.00 rows=10000 width=29)
              ->  Seq Scan on customers c
Planning Time: 0.312 ms
Execution Time: 245.541 ms
```

The problem: a sequential scan on 1M rows, removing 995K by filter. Fix with a composite index:

```sql
CREATE INDEX idx_orders_status_created ON orders(status, created_at DESC);
```

New plan:

```
Nested Loop  (cost=0.72..5124.45 rows=4890 width=52)
  (actual time=0.035..4.812 rows=4823 loops=1)
  ->  Index Scan using idx_orders_status_created on orders o
        (cost=0.42..312.15 rows=4890 width=27)
        (actual time=0.021..1.234 rows=4823 loops=1)
        Index Cond: (status = 'pending' AND created_at > ...)
  ->  Index Scan using customers_pkey on customers c
        (cost=0.29..0.98 rows=1 width=29)
        (actual time=0.001..0.001 rows=1 loops=4823)
Planning Time: 0.287 ms
Execution Time: 5.143 ms
```

**245ms → 5ms** — a 49x improvement from a single composite index.

## Quick Reference Checklist

1. **Always use `EXPLAIN ANALYZE`** for real debugging — `EXPLAIN` alone is just an estimate
2. **Add `BUFFERS`** to see cache hit ratios — `EXPLAIN (ANALYZE, BUFFERS)`
3. **Check row estimates vs actuals** — large discrepancies mean stale statistics
4. **Run `ANALYZE`** on tables after bulk data changes
5. **Look for `Seq Scan` with high `Rows Removed by Filter`** — usually needs an index
6. **Watch for disk sorts** — increase `work_mem` or add indexes
7. **Use [explain.dalibo.com](https://explain.dalibo.com)** to visualize complex plans
8. **Don't over-index** — each index slows writes and consumes storage
9. **Test with production-like data** — plans change dramatically with different data distributions

## Conclusion

`EXPLAIN ANALYZE` is the single most important tool for PostgreSQL performance work. It replaces guesswork with data. The key is to read plans bottom-up (innermost nodes execute first), watch for large gaps between estimated and actual rows, and look for sequential scans on large tables that could benefit from indexes. With practice, reading query plans becomes second nature — and your queries will be faster for it.
