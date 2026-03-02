---
layout: post
title: "How to Add Prometheus Metrics for gRPC Services"
date: 2026-03-01
tags: [Go, Observability]
read_time: 10
excerpt: "A step-by-step guide to instrumenting your gRPC services with Prometheus metrics using Go interceptors — covering latency histograms, request counters, and Grafana dashboards."
---

Observability is a cornerstone of running reliable microservices in production. If you're building gRPC services in Go, adding Prometheus metrics gives you deep visibility into request rates, error rates, and latency distributions. In this post, I'll walk through how to instrument a gRPC service with Prometheus from scratch.

## Why Prometheus for gRPC?

Prometheus is the de facto standard for metrics in cloud-native environments. It pairs naturally with gRPC because:

- **Pull-based model** works well with Kubernetes service discovery
- **Histogram metrics** give you percentile latencies without pre-aggregation
- **Label-based querying** lets you slice metrics by method, status code, and service
- **Grafana integration** provides rich dashboards out of the box

## Setting Up Dependencies

We'll use the `go-grpc-prometheus` library from grpc-ecosystem, which provides pre-built interceptors:

```bash
go get github.com/grpc-ecosystem/go-grpc-prometheus
go get github.com/prometheus/client_golang/prometheus
go get github.com/prometheus/client_golang/prometheus/promhttp
```

## Registering Interceptors

The key to instrumenting gRPC is **interceptors** — middleware that wraps every RPC call. The `go-grpc-prometheus` library provides both unary and stream interceptors.

### Server-Side Metrics

```go
package main

import (
    "net"
    "net/http"

    grpc_prometheus "github.com/grpc-ecosystem/go-grpc-prometheus"
    "github.com/prometheus/client_golang/prometheus/promhttp"
    "google.golang.org/grpc"

    pb "github.com/example/api/myservice/v1"
)

func main() {
    // Create gRPC server with Prometheus interceptors
    grpcServer := grpc.NewServer(
        grpc.UnaryInterceptor(grpc_prometheus.UnaryServerInterceptor),
        grpc.StreamInterceptor(grpc_prometheus.StreamServerInterceptor),
    )

    // Register your service
    pb.RegisterMyServiceServer(grpcServer, &server{})

    // Initialize metrics after all services are registered
    grpc_prometheus.Register(grpcServer)

    // Expose Prometheus metrics on a separate HTTP port
    go func() {
        http.Handle("/metrics", promhttp.Handler())
        http.ListenAndServe(":9090", nil)
    }()

    // Start gRPC server
    lis, _ := net.Listen("tcp", ":50051")
    grpcServer.Serve(lis)
}
```

This gives you three metrics out of the box:

- `grpc_server_started_total` — Counter of RPCs started
- `grpc_server_handled_total` — Counter of RPCs completed (with status code label)
- `grpc_server_msg_received_total` / `grpc_server_msg_sent_total` — Message counts

### Enabling Latency Histograms

By default, latency histograms are disabled. Enable them explicitly:

```go
grpc_prometheus.EnableHandlingTimeHistogram()
```

This adds `grpc_server_handling_seconds` — a histogram that lets you compute p50, p90, p99 latencies per method.

## Client-Side Metrics

Don't forget to instrument the client side too. This gives you visibility into how your service experiences its dependencies:

```go
conn, err := grpc.Dial(
    "target-service:50051",
    grpc.WithUnaryInterceptor(grpc_prometheus.UnaryClientInterceptor),
    grpc.WithStreamInterceptor(grpc_prometheus.StreamClientInterceptor),
)
```

This produces matching `grpc_client_*` metrics.

## Custom Metrics

Sometimes the built-in metrics aren't enough. You can register custom Prometheus metrics for business-specific signals:

```go
var (
    clustersProvisioned = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "clusters_provisioned_total",
            Help: "Total number of clusters provisioned",
        },
        []string{"provider", "region"},
    )

    provisionDuration = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name:    "cluster_provision_duration_seconds",
            Help:    "Time taken to provision a cluster",
            Buckets: prometheus.DefBuckets,
        },
        []string{"provider"},
    )
)

func init() {
    prometheus.MustRegister(clustersProvisioned)
    prometheus.MustRegister(provisionDuration)
}
```

Then use them in your service handlers:

```go
func (s *server) ProvisionCluster(ctx context.Context, req *pb.ProvisionRequest) (*pb.ProvisionResponse, error) {
    timer := prometheus.NewTimer(provisionDuration.WithLabelValues(req.Provider))
    defer timer.ObserveDuration()

    // ... provisioning logic ...

    clustersProvisioned.WithLabelValues(req.Provider, req.Region).Inc()
    return &pb.ProvisionResponse{}, nil
}
```

## Chaining Multiple Interceptors

In real services, you'll have multiple interceptors (auth, logging, tracing, metrics). Use `grpc.ChainUnaryInterceptor` to compose them:

```go
grpcServer := grpc.NewServer(
    grpc.ChainUnaryInterceptor(
        grpc_prometheus.UnaryServerInterceptor,
        loggingInterceptor,
        authInterceptor,
    ),
    grpc.ChainStreamInterceptor(
        grpc_prometheus.StreamServerInterceptor,
        streamLoggingInterceptor,
    ),
)
```

**Tip:** Place the Prometheus interceptor first so it captures the full request duration including time spent in other interceptors.

## Kubernetes Service Monitor

If you're running in Kubernetes with the Prometheus Operator, create a `ServiceMonitor` to auto-discover your metrics endpoint:

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: myservice-monitor
  labels:
    app: myservice
spec:
  selector:
    matchLabels:
      app: myservice
  endpoints:
    - port: metrics
      path: /metrics
      interval: 15s
```

## Useful PromQL Queries

Once metrics are flowing, here are queries you'll use daily:

### Request Rate (per method)

```promql
sum(rate(grpc_server_handled_total[5m])) by (grpc_method)
```

### Error Rate

```promql
sum(rate(grpc_server_handled_total{grpc_code!="OK"}[5m]))
/
sum(rate(grpc_server_handled_total[5m]))
```

### P99 Latency

```promql
histogram_quantile(0.99,
  sum(rate(grpc_server_handling_seconds_bucket[5m])) by (le, grpc_method)
)
```

### Grafana Dashboard

The grpc-ecosystem project provides a ready-made Grafana dashboard. Import dashboard ID **12899** from Grafana's dashboard marketplace for a quick start covering request rates, error rates, and latency percentiles per method.

## Best Practices

1. **Always expose metrics on a separate port** — Don't mix your metrics endpoint with your gRPC port. Use `:9090` or `:2112` for metrics.

2. **Use histogram buckets wisely** — The default buckets work for most cases, but tune them for your SLA. If your p99 target is 200ms, ensure you have buckets around that range.

3. **Label cardinality matters** — Avoid adding high-cardinality labels (like user IDs) to metrics. Stick to method names, status codes, and service names.

4. **Set up alerts on golden signals** — Use the RED method (Rate, Errors, Duration) to create alerts:
   - Request rate drops below baseline
   - Error rate exceeds threshold
   - P99 latency exceeds SLA

5. **Enable `EnableClientHandlingTimeHistogram()`** on client interceptors too — This is easy to forget but critical for understanding downstream latency.

## Conclusion

Adding Prometheus metrics to your gRPC services is straightforward with the `go-grpc-prometheus` library. The interceptor pattern means you get comprehensive metrics with minimal code changes. Combined with Kubernetes ServiceMonitors and Grafana dashboards, you get full observability into your service mesh without any application-level changes to your handlers.

The key takeaway: **instrument early**. Adding metrics after an incident is too late. Bake observability into your service template from day one, and every new service you spin up will be observable by default.
