# DigitalBank Frontend

Static HTML/CSS/JavaScript frontend for the DigitalBank backend.

## Production API

`https://digital-bank-kvhc.onrender.com`

## Important balance architecture

The frontend no longer asks staff/customer users to type an integration/provider token or account number just to display a balance.

The intended backend endpoints are:

- Customer: `GET /bank/accounts/:accountNumber/balance` — frontend may use the account number internally from the account list; the user never types it.
- Staff/Admin/Super Admin: `GET /staff/customers/:customerId/balance` — backend resolves the customer's account(s) and provider authentication internally.

For a truly provider-token-free frontend, the backend must obtain its provider token server-side from environment variables and never expose it to the browser.
