# When to Mock

Mock at **system boundaries** only:

- External APIs (payment, email, etc.)
- Databases (sometimes - prefer test DB)
- Time/randomness
- File system (sometimes)

Don't mock:

- Your own classes/modules
- Internal collaborators
- Anything you control

## Rules

- **A mock earns no assertions.** Assert the real component's behavior, not the mock's presence. If the mock is what you're checking, unmock it or delete the assertion.
- **Mock at the right level.** Learn every side effect of the real method before replacing it; mock the slow/external operation below it and keep what the test depends on real. Unsure → run against the real thing first.
- **Make doubles specific.** If arguments, counts, or order are part of the contract, assert them. Give each branch (success, error, malformed) its own fixture so the wrong branch can't satisfy the test.
- **Mirror the complete real structure**, not just the fields the test reads; partial mocks pass while integration breaks.
- **Production classes carry production methods only.** Test-only cleanup/helpers live in test utilities.
- Mock setup outgrows the test logic, or breaks whenever the mock changes → switch to an integration test with real components.

## Designing for Mockability

At system boundaries, design interfaces that are easy to mock:

**1. Use dependency injection**

Pass external dependencies in rather than creating them internally:

```typescript
// Easy to mock
function processPayment(order, paymentClient) {
  return paymentClient.charge(order.total);
}

// Hard to mock
function processPayment(order) {
  const client = new StripeClient(process.env.STRIPE_KEY);
  return client.charge(order.total);
}
```

**2. Prefer SDK-style interfaces over generic fetchers**

Create specific functions for each external operation instead of one generic function with conditional logic:

```typescript
// GOOD: Each function is independently mockable
const api = {
  getUser: (id) => fetch(`/users/${id}`),
  getOrders: (userId) => fetch(`/users/${userId}/orders`),
  createOrder: (data) => fetch('/orders', { method: 'POST', body: data }),
};

// BAD: Mocking requires conditional logic inside the mock
const api = {
  fetch: (endpoint, options) => fetch(endpoint, options),
};
```

The SDK approach means:
- Each mock returns one specific shape
- No conditional logic in test setup
- Easier to see which endpoints a test exercises
- Type safety per endpoint
