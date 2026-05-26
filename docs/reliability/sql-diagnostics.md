# SQL Diagnostics

```sql
SELECT status, COUNT(*)
FROM event_idempotency_registry
GROUP BY status
ORDER BY status;
```

```sql
SELECT COUNT(*) AS total_rows
FROM event_idempotency_registry;
```
