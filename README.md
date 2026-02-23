# venturayachts
Middleware for Ventura Yachts

## Netlify Functions
Functions live in `netlify/functions` and are configured in `netlify.toml`.

Demo endpoints:
- `/.netlify/functions/demo-hello?name=Skipper`
- `/.netlify/functions/demo-availability?boatId=ventura-42`

Framer form webhook:
- `/.netlify/functions/framer-form-webhook`

Notes:
- CORS allows requests from `*.framer.app` origins.
- The webhook accepts `application/json` or `application/x-www-form-urlencoded`.
