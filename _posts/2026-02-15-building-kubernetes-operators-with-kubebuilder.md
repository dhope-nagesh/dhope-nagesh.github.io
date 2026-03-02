---
layout: post
title: "Building Custom Kubernetes Operators with Kubebuilder"
date: 2026-02-15
tags: [Kubernetes, Go]
read_time: 8
excerpt: "A practical guide to building production-ready Kubernetes Operators using Kubebuilder, covering CRD design, reconciliation loops, and testing strategies."
---

Kubernetes Operators extend the platform's capabilities by encoding operational knowledge into software. In this post, I'll walk through how to build a production-ready operator using [Kubebuilder](https://kubebuilder.io), drawing from my experience building operators at EnterpriseDB.

## Why Build an Operator?

If you're managing stateful applications on Kubernetes — databases, message queues, or any system that requires specific operational procedures — an operator lets you automate:

- **Provisioning** — Create complex resources from a single custom resource
- **Scaling** — Handle scale-up/down with application-aware logic
- **Backup & Recovery** — Automate backup schedules and disaster recovery
- **Upgrades** — Rolling upgrades with health checks and rollback

## Getting Started with Kubebuilder

First, scaffold a new project:

```bash
kubebuilder init --domain example.com --repo github.com/example/my-operator
kubebuilder create api --group app --version v1 --kind Database
```

This gives you a well-structured project with:
- `api/v1/` — Your Custom Resource Definition (CRD) types
- `controllers/` — Reconciliation logic
- `config/` — Kustomize manifests for deployment

## Designing Your CRD

The CRD spec is the user-facing API. Keep it simple and declarative:

```go
type DatabaseSpec struct {
    // Engine is the database engine (e.g., "postgres", "mysql")
    Engine string `json:"engine"`

    // Version is the database engine version
    Version string `json:"version"`

    // Replicas is the number of database instances
    // +kubebuilder:validation:Minimum=1
    // +kubebuilder:validation:Maximum=5
    Replicas int32 `json:"replicas"`

    // Storage defines the persistent volume configuration
    Storage StorageSpec `json:"storage"`
}

type DatabaseStatus struct {
    // Phase represents the current lifecycle phase
    Phase DatabasePhase `json:"phase,omitempty"`

    // ReadyReplicas is the count of ready instances
    ReadyReplicas int32 `json:"readyReplicas,omitempty"`

    // Conditions represent the latest observations
    Conditions []metav1.Condition `json:"conditions,omitempty"`
}
```

Use kubebuilder markers for validation, defaulting, and printer columns. This generates the OpenAPI schema automatically.

## The Reconciliation Loop

The heart of any operator is the `Reconcile` function. It follows a **level-triggered** approach — you always reconcile to the desired state, regardless of what event triggered the reconciliation:

```go
func (r *DatabaseReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    log := log.FromContext(ctx)

    // 1. Fetch the custom resource
    var db appv1.Database
    if err := r.Get(ctx, req.NamespacedName, &db); err != nil {
        return ctrl.Result{}, client.IgnoreNotFound(err)
    }

    // 2. Ensure dependent resources exist
    if err := r.ensureStatefulSet(ctx, &db); err != nil {
        return ctrl.Result{}, err
    }

    if err := r.ensureService(ctx, &db); err != nil {
        return ctrl.Result{}, err
    }

    // 3. Update status
    if err := r.updateStatus(ctx, &db); err != nil {
        return ctrl.Result{}, err
    }

    return ctrl.Result{}, nil
}
```

Key principles:
- **Idempotent** — Running reconcile multiple times produces the same result
- **Owns resources** — Use `controllerutil.SetControllerReference` so garbage collection works
- **Status subresource** — Always update status to reflect actual state

## Testing Strategies

Kubebuilder integrates with [envtest](https://pkg.go.dev/sigs.k8s.io/controller-runtime/pkg/envtest), which spins up a real API server and etcd for integration tests:

```go
func TestDatabaseReconciler(t *testing.T) {
    ctx := context.Background()

    // Create a Database resource
    db := &appv1.Database{
        ObjectMeta: metav1.ObjectMeta{
            Name:      "test-db",
            Namespace: "default",
        },
        Spec: appv1.DatabaseSpec{
            Engine:   "postgres",
            Version:  "16",
            Replicas: 2,
        },
    }
    Expect(k8sClient.Create(ctx, db)).To(Succeed())

    // Verify the StatefulSet was created
    Eventually(func() bool {
        var sts appsv1.StatefulSet
        err := k8sClient.Get(ctx, types.NamespacedName{
            Name:      "test-db",
            Namespace: "default",
        }, &sts)
        return err == nil
    }, timeout, interval).Should(BeTrue())
}
```

## Production Considerations

From running operators in production, here are lessons learned:

1. **Use finalizers** for cleanup of external resources (cloud load balancers, DNS records)
2. **Rate-limit reconciliation** to avoid thundering herd during cluster-wide events
3. **Emit events** so users can `kubectl describe` to troubleshoot
4. **Implement leader election** for high availability of the operator itself
5. **Monitor with Prometheus** — expose reconcile duration, error counts, and queue depth

## Wrapping Up

Kubebuilder provides excellent scaffolding, but building a robust operator requires understanding Kubernetes internals — ownership, garbage collection, finalizers, and the watch/cache mechanism. Start simple, test thoroughly with envtest, and iterate based on real operational needs.

If you're building operators for database workloads, I'd also recommend looking at the [CloudNativePG](https://cloudnative-pg.io) project for inspiration on patterns for stateful workloads.
