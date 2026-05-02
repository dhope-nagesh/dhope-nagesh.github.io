---
layout: post
title: "MCP for PostgreSQL: AI-Powered Database Management with pg-airman-mcp"
date: 2026-05-02
tags: [PostgreSQL, AI, MCP, Performance]
read_time: 16
excerpt: "How to connect AI assistants directly to PostgreSQL using pg-airman-mcp — a Model Context Protocol server that exposes 22 tools for schema exploration, query optimization, index tuning, and database health monitoring."
---

What if your AI assistant could directly explore your database schema, identify slow queries, recommend indexes, and run health checks — all through natural language? That's exactly what [pg-airman-mcp](https://github.com/EnterpriseDB/pg-airman-mcp) does.

Built by [EnterpriseDB](https://www.enterprisedb.com), pg-airman-mcp is an open-source [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that bridges PostgreSQL databases with AI assistants like Claude. It exposes **22 tools** spanning schema exploration, query optimization, index tuning, and production health monitoring — and it pairs LLM reasoning with classical, deterministic optimization algorithms rather than relying solely on AI-generated guesses.

In this post, we'll set it up, walk through real examples using the tools it exposes, and see how it turns your AI assistant into a capable DBA sidekick.

## Why MCP for PostgreSQL?

Traditional database management involves jumping between `psql`, monitoring dashboards, manual `EXPLAIN ANALYZE` runs, and index tuning spreadsheets. MCP changes this by giving AI assistants structured access to your database through well-defined tools.

pg-airman-mcp stands out from other Postgres MCP servers because it:

- Uses an **industrial-strength index tuning algorithm** adapted from Microsoft SQL Server's Anytime Algorithm — it explores thousands of potential index combinations using hypothetical indexes (`hypopg`) instead of just guessing
- Supports both **restricted (read-only)** and **unrestricted** access modes — safe for production
- Includes a **semantic knowledge base** so your AI assistant can search schema using natural language
- Provides **governance features** like purpose logging and session token tracing for audit trails
- Targets PostgreSQL versions **14 through 18**

## Setting Up pg-airman-mcp

### Prerequisites

You'll need a running PostgreSQL instance. For the full feature set, install these extensions:

```sql
-- Tracks query execution statistics (needed for slow query analysis)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Enables hypothetical index simulation (needed for index recommendations)
CREATE EXTENSION IF NOT EXISTS hypopg;
```

### Installation via Docker (Recommended)

```bash
docker pull enterprisedb/pg-airman-mcp
```

### Installation via pip

```bash
# Using pipx
pipx install pg-airman-mcp

# Or using uv
uv pip install pg-airman-mcp
```

Python installation requires Python 3.12+, a C compiler, `libpq-dev`, and `pg_config` in your PATH.

### Configuring with Claude Desktop

Add this to your Claude Desktop configuration file (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

**Docker setup:**

```json
{
  "mcpServers": {
    "postgres": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "AIRMAN_MCP_DATABASE_URL",
        "enterprisedb/pg-airman-mcp",
        "--access-mode=unrestricted"
      ],
      "env": {
        "AIRMAN_MCP_DATABASE_URL": "postgresql://user:password@host.docker.internal:5432/mydb"
      }
    }
  }
}
```

**Native setup:**

```json
{
  "mcpServers": {
    "postgres": {
      "command": "pg-airman-mcp",
      "args": ["--access-mode=unrestricted"],
      "env": {
        "AIRMAN_MCP_DATABASE_URL": "postgresql://user:password@localhost:5432/mydb"
      }
    }
  }
}
```

Use `--access-mode=restricted` for production databases — this enforces read-only transactions with execution time limits.

### Configuring with Claude Code

Add the MCP server to your Claude Code settings:

```bash
claude mcp add postgres -- docker run -i --rm \
  -e AIRMAN_MCP_DATABASE_URL=postgresql://user:password@host.docker.internal:5432/mydb \
  enterprisedb/pg-airman-mcp --access-mode=unrestricted
```

## The 22 Tools at a Glance

pg-airman-mcp organizes its tools into logical categories:

| Category | Tools | Purpose |
|---|---|---|
| **Schema Discovery** | `list_schemas`, `list_objects`, `get_object_details` | Explore database structure |
| **SQL Execution** | `execute_sql`, `explain_query` | Run queries and analyze plans |
| **Query Performance** | `get_top_queries`, `analyze_query_indexes` | Find and fix slow queries |
| **Index Tuning** | `analyze_workload_indexes` | Workload-wide index recommendations |
| **Health Monitoring** | `analyze_db_health` | Comprehensive database health checks |
| **Documentation** | `add_comment_to_object`, `remove_comment` | Document database objects |
| **Knowledge Base** | `search_kb`, `list_kbs`, `get_kb_stats`, `refresh_kb` | Semantic search over schema |
| **Aliases** | `create_alias`, `delete_alias`, `search_aliases`, `execute_alias`, `list_aliases` | Reusable parameterized queries |
| **Context** | `discover_context` | Single-call schema + alias discovery |

### Extension Dependencies

Not all 22 tools work out of the box — some require PostgreSQL extensions to be installed. Here's the breakdown:

| Extension | Required By | What It Enables |
|---|---|---|
| **`pg_stat_statements`** | `get_top_queries`, `analyze_workload_indexes` | Tracks execution statistics (call count, total time, rows) for all SQL statements. Without it, the server has no visibility into which queries are slow or frequently executed. |
| **`hypopg`** | `analyze_query_indexes`, `analyze_workload_indexes`, `explain_query` (hypothetical mode) | Creates hypothetical (virtual) indexes that exist only in the planner — never written to disk. This is how pg-airman-mcp simulates index candidates and measures estimated improvement without actually creating indexes. |
| **`aidb`** | `search_kb`, `list_kbs`, `get_kb_stats`, `refresh_kb`, `create_alias`, `delete_alias`, `search_aliases`, `execute_alias`, `list_aliases`, `discover_context` | EDB's AI Accelerator extension that provides semantic knowledge bases and aliases. Powers natural-language search over your schema and reusable parameterized query discovery. **10 out of 22 tools depend on this extension.** |

That's a significant split: **12 tools** work with open-source PostgreSQL extensions, while **10 tools** require the proprietary `aidb` extension.

#### Open-Source Extensions

Install `pg_stat_statements` and `hypopg` for query performance and index tuning tools:

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS hypopg;
```

**`pg_stat_statements`** is bundled with PostgreSQL but must be added to `shared_preload_libraries` in `postgresql.conf` and requires a server restart:

```
# postgresql.conf
shared_preload_libraries = 'pg_stat_statements'
```

**`hypopg`** is a third-party open-source extension. Install it via your package manager:

```bash
# Debian/Ubuntu
sudo apt install postgresql-17-hypopg

# RHEL/Fedora
sudo dnf install hypopg_17

# macOS (Homebrew)
brew install hypopg
```

#### EDB Proprietary Extension: `aidb`

The `aidb` extension is part of [EDB Postgres AI](https://www.enterprisedb.com/docs/edb-postgres-ai/ai-accelerator/) (the AI Accelerator component). It is **not available in community PostgreSQL** — you need an EDB subscription or an EDB-managed database (e.g., EDB BigAnimal / EDB Postgres AI Cloud Service).

`aidb` provides:

- **Semantic Knowledge Bases** — automatically vectorizes your database schema metadata (tables, views, columns) so AI assistants can search it using natural language
- **Semantic Aliases** — stores parameterized SQL queries with natural-language descriptions, vectorized for similarity-based discovery
- **Embedding Model Management** — registers and manages embedding models directly inside PostgreSQL
- **Auto-Processing** — automatically maintains embeddings as your schema changes

All KB tools call `aidb.*` SQL functions directly (e.g., `search_kb` calls `aidb.get_metadata()` and `aidb.get_entity_definitions()`). Without `aidb` installed, these tools will fail with SQL errors — there is no graceful fallback.

#### What Works Without Any Extensions?

With vanilla PostgreSQL (no extensions at all), you still get **7 fully functional tools**: `list_schemas`, `list_objects`, `get_object_details`, `execute_sql`, `explain_query` (basic mode without hypothetical indexes), `add_comment_to_object`, `remove_comment`, and `analyze_db_health`. That covers schema exploration, SQL execution, documentation, and health monitoring — a solid baseline even without extensions.

Let's see these in action with a sample e-commerce database.

## Setting Up a Sample Database

For our examples, let's assume an e-commerce database with these tables:

```sql
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    category VARCHAR(50),
    price NUMERIC(10,2) NOT NULL,
    stock_count INTEGER DEFAULT 0
);

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    customer_id INTEGER REFERENCES customers(id),
    status VARCHAR(20) DEFAULT 'pending',
    total NUMERIC(10,2),
    created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id),
    product_id INTEGER REFERENCES products(id),
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(10,2) NOT NULL
);

-- Seed with realistic data
INSERT INTO customers (email, name)
SELECT
    'user' || i || '@example.com',
    'Customer ' || i
FROM generate_series(1, 50000) AS i;

INSERT INTO products (name, category, price, stock_count)
SELECT
    'Product ' || i,
    (ARRAY['Electronics','Clothing','Books','Home','Sports'])[floor(random()*5+1)::int],
    (random() * 200 + 5)::numeric(10,2),
    (random() * 500)::int
FROM generate_series(1, 1000) AS i;

INSERT INTO orders (customer_id, status, total, created_at)
SELECT
    (random() * 49999 + 1)::int,
    (ARRAY['pending','shipped','delivered','cancelled'])[floor(random()*4+1)::int],
    (random() * 500 + 10)::numeric(10,2),
    now() - (random() * interval '180 days')
FROM generate_series(1, 500000) AS i;

INSERT INTO order_items (order_id, product_id, quantity, unit_price)
SELECT
    (random() * 499999 + 1)::int,
    (random() * 999 + 1)::int,
    (random() * 5 + 1)::int,
    (random() * 200 + 5)::numeric(10,2)
FROM generate_series(1, 1200000) AS i;
```

Now let's explore what the tools can do.

## Example 1: Schema Discovery

**You ask:** "What tables are in my database?"

The AI assistant calls `list_schemas` followed by `list_objects`:

```
Tool: list_schemas
→ Returns: public, pg_catalog, information_schema

Tool: list_objects
  schema: "public"
→ Returns:
  Tables: customers, products, orders, order_items
  Sequences: customers_id_seq, products_id_seq, orders_id_seq, order_items_id_seq
```

Then to understand a specific table:

```
Tool: get_object_details
  schema: "public"
  object_name: "orders"
→ Returns:
  Columns:
    - id: integer (PK, NOT NULL)
    - customer_id: integer (FK → customers.id)
    - status: varchar(20), default 'pending'
    - total: numeric(10,2)
    - created_at: timestamp, default now()
  Indexes:
    - orders_pkey (btree on id)
  Foreign Keys:
    - orders_customer_id_fkey → customers(id)
```

This is the foundation — the AI now has full context about your schema and can write accurate queries without you pasting DDL into the chat.

## Example 2: Finding and Optimizing Slow Queries

**You ask:** "What are the slowest queries in my database?"

```
Tool: get_top_queries
  limit: 5
→ Returns:
  1. SELECT o.*, c.name, c.email
     FROM orders o JOIN customers c ON o.customer_id = c.id
     WHERE o.status = 'pending' AND o.created_at > now() - interval '7 days'
     Avg time: 245ms | Calls: 1,847

  2. SELECT p.category, SUM(oi.quantity * oi.unit_price) as revenue
     FROM order_items oi JOIN products p ON oi.product_id = p.id
     GROUP BY p.category
     Avg time: 189ms | Calls: 523

  3. SELECT customer_id, COUNT(*) as order_count
     FROM orders
     WHERE created_at > now() - interval '30 days'
     GROUP BY customer_id
     HAVING COUNT(*) > 5
     Avg time: 156ms | Calls: 2,104
```

Now let's dig into the slowest one. The AI calls `explain_query`:

```
Tool: explain_query
  query: "SELECT o.*, c.name, c.email FROM orders o
          JOIN customers c ON o.customer_id = c.id
          WHERE o.status = 'pending'
          AND o.created_at > now() - interval '7 days'"
→ Returns:
  Hash Join (cost=1890.00..15234.56 rows=12500)
    → Seq Scan on orders (cost=0.00..12345.00 rows=12500)
        Filter: status = 'pending' AND created_at > ...
        Rows Removed by Filter: 487500
    → Hash (cost=1234.00..1234.00 rows=50000)
        → Seq Scan on customers
```

The plan reveals two sequential scans — no indexes are being used on the filter columns. Let's fix that.

## Example 3: AI-Powered Index Recommendations

**You ask:** "Can you recommend indexes for that slow query?"

```
Tool: analyze_query_indexes
  queries:
    - "SELECT o.*, c.name, c.email FROM orders o
       JOIN customers c ON o.customer_id = c.id
       WHERE o.status = 'pending'
       AND o.created_at > now() - interval '7 days'"
→ Returns:
  Recommended Indexes:
    1. CREATE INDEX idx_orders_status_created ON orders(status, created_at);
       Estimated improvement: 87%
       Simulated with hypothetical index — plan switches from Seq Scan to Index Scan

    2. CREATE INDEX idx_orders_customer_id ON orders(customer_id);
       Estimated improvement: 23% (for the join)
       Note: Also benefits query #3 from top queries
```

This is where pg-airman-mcp shines. It doesn't just guess — it creates hypothetical indexes using `hypopg`, re-runs the query planner against them, and measures the estimated improvement. The underlying algorithm explores combinations of multi-column indexes and evaluates trade-offs between read performance gains and write overhead.

Let's verify by simulating the index in the explain plan:

```
Tool: explain_query
  query: "SELECT o.*, c.name, c.email FROM orders o
          JOIN customers c ON o.customer_id = c.id
          WHERE o.status = 'pending'
          AND o.created_at > now() - interval '7 days'"
  hypothetical_indexes:
    - "CREATE INDEX ON orders(status, created_at)"
→ Returns:
  Nested Loop (cost=12.50..456.78 rows=12500)
    → Index Scan using hypothetical_idx on orders (cost=0.42..234.56 rows=12500)
        Index Cond: status = 'pending' AND created_at > ...
    → Index Scan using customers_pkey on customers (cost=0.29..0.31 rows=1)
        Index Cond: id = o.customer_id
```

The sequential scan is gone. Once you're confident, create the real index:

```
Tool: execute_sql
  sql: "CREATE INDEX CONCURRENTLY idx_orders_status_created
        ON orders(status, created_at);"
```

## Example 4: Workload-Wide Index Analysis

For a broader view, `analyze_workload_indexes` examines your entire query workload:

**You ask:** "Analyze my full workload and suggest the optimal set of indexes."

```
Tool: analyze_workload_indexes
→ Returns:
  Workload Analysis (based on pg_stat_statements):
    Queries analyzed: 47
    Resource-intensive queries identified: 12

  Recommended Index Set:
    1. CREATE INDEX idx_orders_status_created ON orders(status, created_at);
       Benefits queries: #1, #5, #9
       Estimated workload improvement: 34%

    2. CREATE INDEX idx_order_items_order_id ON order_items(order_id);
       Benefits queries: #2, #4, #7, #11
       Estimated workload improvement: 28%

    3. CREATE INDEX idx_orders_customer_created ON orders(customer_id, created_at DESC);
       Benefits queries: #3, #6
       Estimated workload improvement: 15%

  Indexes NOT recommended (cost > benefit):
    - orders(total): Only benefits 1 query, adds write overhead
    - products(category, price): Low selectivity on category
```

This is the Anytime Algorithm at work — it evaluates thousands of candidate index combinations and returns the set that maximizes overall workload performance, not just individual query speed.

## Example 5: Database Health Check

**You ask:** "How healthy is my database?"

```
Tool: analyze_db_health
→ Returns:
  Overall Health: WARNING (3 issues found)

  ✅ Buffer Cache Hit Rate: 98.7% (healthy, target > 95%)
  ✅ Connection Utilization: 23/100 (healthy)
  ✅ Replication Lag: N/A (no replicas)
  ✅ Sequence Limits: All sequences < 10% of max value

  ⚠️  Index Health:
    - 4 unused indexes consuming 128 MB:
      idx_orders_old_status (64 MB, 0 scans since last reset)
      idx_products_legacy_sku (32 MB, 0 scans)
      idx_customers_phone (18 MB, 0 scans)
      idx_order_items_legacy (14 MB, 0 scans)
    - 2 duplicate indexes:
      idx_orders_cust and orders_customer_id_fkey both on orders(customer_id)

  ⚠️  Vacuum Health:
    - orders: Last autovacuum 3 days ago, 45,000 dead tuples
      (autovacuum threshold: 50,000 — will trigger soon)
    - order_items: Last autovacuum 5 days ago, 120,000 dead tuples
      Recommendation: Consider lowering autovacuum_vacuum_threshold for this table

  ⚠️  Constraint Health:
    - order_items has no CHECK constraint on quantity (allows negative values)
    - products.stock_count has no CHECK constraint (allows negative values)
```

A single tool call surfaces issues that would typically require checking multiple monitoring systems.

## Example 6: Documenting Your Schema

**You ask:** "Add documentation to the orders table explaining the status values."

```
Tool: add_comment_to_object
  schema: "public"
  object_name: "orders"
  comment: "Customer orders. Status flow: pending → shipped → delivered.
            Cancelled orders retain their row for analytics."

Tool: add_comment_to_object
  schema: "public"
  object_name: "orders"
  column: "status"
  comment: "Order lifecycle state. Values: pending, shipped, delivered, cancelled.
            Only pending orders can be cancelled."
```

These comments are stored in PostgreSQL's catalog and are visible to anyone querying `\d+ orders` in psql — and to the AI assistant in future sessions via `get_object_details`.

## Example 7: Semantic Aliases for Reusable Queries

Aliases let you create reusable, parameterized queries with natural language descriptions:

**You ask:** "Create an alias for checking a customer's recent orders."

```
Tool: create_alias
  name: "customer_recent_orders"
  description: "Get recent orders for a customer by email, with order details
                and item count. Useful for customer support lookups."
  sql: "SELECT o.id, o.status, o.total, o.created_at,
              COUNT(oi.id) as item_count
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE c.email = :email
          AND o.created_at > now() - interval :days_back || ' days'
        GROUP BY o.id
        ORDER BY o.created_at DESC"
  parameters:
    - name: "email"
      type: "text"
      description: "Customer email address"
    - name: "days_back"
      type: "integer"
      description: "Number of days to look back"
      default: 30
```

Now anyone (human or AI) can find and use this:

```
Tool: search_aliases
  query: "customer support order lookup"
→ Returns: customer_recent_orders (relevance: 0.92)

Tool: execute_alias
  name: "customer_recent_orders"
  parameters:
    email: "user42@example.com"
    days_back: 90
→ Returns:
  | id    | status    | total  | created_at          | item_count |
  |-------|-----------|--------|---------------------|------------|
  | 48921 | delivered | 234.50 | 2026-04-28 14:23:00 | 3          |
  | 41002 | shipped   | 89.99  | 2026-04-15 09:11:00 | 1          |
  | 38456 | delivered | 412.00 | 2026-03-22 16:45:00 | 5          |
```

Aliases are especially powerful in team settings — senior engineers can encode domain knowledge into parameterized queries that junior team members and AI assistants can discover and execute safely.

## Example 8: Context Discovery for SQL Generation

The `discover_context` tool is a single-call way to get everything the AI needs to write accurate SQL:

**You ask:** "I need to find customers who haven't ordered in 60 days but were previously active."

```
Tool: discover_context
  description: "Find inactive customers who previously had frequent orders"
→ Returns:
  Relevant Tables:
    - customers (id, email, name, created_at)
    - orders (id, customer_id, status, total, created_at)

  Relevant Aliases:
    - customer_recent_orders (parameterized lookup)
    - monthly_active_customers (aggregate report)

  Suggested Approach:
    Join customers with orders, filter by last order date > 60 days ago,
    with a subquery for historical order frequency
```

The AI then writes the query with full schema awareness — no hallucinated column names, correct join conditions, proper data types.

## Access Modes: Development vs Production

pg-airman-mcp provides two access modes to match your environment:

### Unrestricted Mode (Development)

```bash
pg-airman-mcp --access-mode=unrestricted
```

- Full read/write access
- Can create indexes, modify schema, insert data
- Can refresh the semantic knowledge base
- Use this for development and staging

### Restricted Mode (Production)

```bash
pg-airman-mcp --access-mode=restricted
```

- Read-only transactions only
- Execution time limits prevent runaway queries
- SQL is parsed via `pglast` to block write operations
- Health checks and analysis tools work normally
- Use this for production monitoring

## Transport Options

pg-airman-mcp supports three transport protocols:

```bash
# stdio (default) — one client per server process
pg-airman-mcp --transport=stdio

# SSE — multiple clients share one server (port 8000)
pg-airman-mcp --transport=sse

# Streamable HTTP — modern HTTP transport (port 8001)
pg-airman-mcp --transport=streamable-http
```

SSE and Streamable HTTP are useful when multiple AI agents or team members need to share a single MCP server instance connected to the same database.

## Security and Governance

For production deployments, pg-airman-mcp supports OAuth 2.0 authentication:

```bash
export AIRMAN_MCP_AUTH_ENABLED=true
export AIRMAN_MCP_AUTH_TYPE=introspection  # or 'jwt'
export AIRMAN_MCP_AUTH_SERVER_URL=https://auth.example.com
```

Every query execution is logged with the `application_name` set in PostgreSQL, and session tokens are traced — giving you a full audit trail of what the AI assistant did and when.

## Wrapping Up

pg-airman-mcp turns your AI assistant into a database-aware collaborator that can:

- **Explore** schemas without you pasting DDL
- **Find** slow queries from actual production statistics
- **Recommend** indexes using real optimization algorithms, not guesswork
- **Monitor** database health across multiple dimensions
- **Document** your schema with persistent comments
- **Encode** team knowledge as searchable, reusable aliases

The combination of MCP's structured tool protocol with PostgreSQL-specific optimization algorithms means you get answers grounded in actual database statistics and query plans — not just LLM-generated SQL that "looks right."

If you're already using [EXPLAIN ANALYZE](/blog/postgresql-explain-analyze-guide/) to debug queries manually, pg-airman-mcp automates that workflow while adding index simulation and workload analysis on top. And if you've built [MCP servers](/blog/building-mcp-server-for-todo-app-with-fastapi-and-langchain/) before, this is a great example of a production-grade server with governance, access control, and real algorithmic depth.

Get started: [github.com/EnterpriseDB/pg-airman-mcp](https://github.com/EnterpriseDB/pg-airman-mcp)
