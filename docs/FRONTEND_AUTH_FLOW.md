# Browser login and token flow

The frontend uses the backend's first-party authentication endpoints. No hosted identity or error-monitoring service is required.

1. Registration calls `POST /auth/register`. In local development only, the API can return a development verification token; the frontend verifies it immediately. In configured environments, the user follows the emailed verification link.
2. Email verification and password reset tokens arrive in the URL fragment. The frontend removes the fragment from the visible address before sending the token to the API.
3. Login calls `POST /auth/login`. The short-lived access token stays in Zustand memory. The refresh credential is set by the API in an HttpOnly, SameSite cookie and is never read by JavaScript.
4. On page load and before access-token expiry, the client calls `POST /auth/refresh` with credentials enabled. Refresh requests are deduplicated within the tab and use the Web Locks API across tabs when available.
5. Users without a business are directed to onboarding. Completing onboarding receives a workspace-scoped access token, then fetches the authenticated current-business snapshot.
6. Protected API calls include the in-memory bearer token. Public auth calls explicitly omit it. Sign out calls `POST /auth/logout`, which revokes the current refresh session, and clears frontend session state.

The client does not persist access tokens to local storage or session storage. A failed refresh returns the user to sign-in; connection failures show a retry screen. The API origin is configured with `VITE_API_BASE_URL`, and credentialed CORS must allow the frontend origin.

## Browser routes

- `/auth/login`
- `/auth/register`
- `/auth/verify-email`
- `/auth/forgot-password`
- `/auth/reset-password`
- `/auth/onboarding` (authenticated users without a business)
- `/` (authenticated business workspace)
