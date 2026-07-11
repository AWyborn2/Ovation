## compare-retry
- console: [error] Failed to load resource: net::ERR_CONNECTION_RESET
- console: [error] Failed to load resource: the server responded with a status of 401 (Unauthorized)
- console: [error] Failed to load resource: net::ERR_TUNNEL_CONNECTION_FAILED
- requestfailed: GET https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap :: net::ERR_CONNECTION_RESET
- requestfailed: GET https://res.cloudinary.com/playhq/image/upload/v1/production/ca/84fe5d06-5eeb-4fe5-85d1-bf3fd59956aa/1689819925822/logo.png :: net::ERR_TUNNEL_CONNECTION_FAILED
- badresponse: 401 GET http://mandurah.ovation.test:24624/api/auth/me
- notes: compare triggers: [{"tag":"BUTTON","role":"combobox","text":"Select Player A..."},{"tag":"BUTTON","role":"combobox","text":"Select Player B..."}]
- notes: BROKEN IMAGES: https://res.cloudinary.com/playhq/image/upload/v1/production/ca/84fe5d06-5eeb-4fe5-85d1-bf3fd59956aa/1689819925822/logo.png, https://res.cloudinary.com/playhq/image/upload/v1/production/ca/84fe5d06-5eeb-4fe5-85d1-bf3fd59956aa/1689819925822/logo.png
- notes: HORIZONTAL SCROLL: scrollWidth 1464 > viewport 1280

## anon-add-player
- console: [error] Failed to load resource: net::ERR_CONNECTION_RESET
- console: [error] Failed to load resource: the server responded with a status of 401 (Unauthorized)
- console: [error] Failed to load resource: net::ERR_TUNNEL_CONNECTION_FAILED
- console: [warning] Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.
- requestfailed: GET https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap :: net::ERR_CONNECTION_RESET
- requestfailed: GET https://res.cloudinary.com/playhq/image/upload/v1/production/ca/84fe5d06-5eeb-4fe5-85d1-bf3fd59956aa/1689819925822/logo.png :: net::ERR_TUNNEL_CONNECTION_FAILED
- badresponse: 401 GET http://mandurah.ovation.test:24624/api/auth/me
- notes: Add Player button IS visible to anonymous visitor

## anon-edit-link
- console: [error] Failed to load resource: net::ERR_CONNECTION_RESET
- console: [error] Failed to load resource: the server responded with a status of 401 (Unauthorized)
- console: [error] Failed to load resource: the server responded with a status of 401 (Unauthorized)
- console: [error] Failed to load resource: net::ERR_TUNNEL_CONNECTION_FAILED
- console: [error] Failed to load resource: the server responded with a status of 401 (Unauthorized)
- requestfailed: GET https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap :: net::ERR_CONNECTION_RESET
- requestfailed: GET https://res.cloudinary.com/playhq/image/upload/v1/production/ca/84fe5d06-5eeb-4fe5-85d1-bf3fd59956aa/1689819925822/logo.png :: net::ERR_TUNNEL_CONNECTION_FAILED
- badresponse: 401 GET http://mandurah.ovation.test:24624/api/auth/me
- badresponse: 401 GET http://mandurah.ovation.test:24624/api/auth/me
- badresponse: 401 GET http://mandurah.ovation.test:24624/api/auth/me
- notes: Edit control IS visible to anonymous visitor on player detail

## players-empty-search
- console: [error] Failed to load resource: net::ERR_CONNECTION_RESET
- console: [error] Failed to load resource: the server responded with a status of 401 (Unauthorized)
- console: [error] Failed to load resource: net::ERR_TUNNEL_CONNECTION_FAILED
- requestfailed: GET https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap :: net::ERR_CONNECTION_RESET
- requestfailed: GET https://res.cloudinary.com/playhq/image/upload/v1/production/ca/84fe5d06-5eeb-4fe5-85d1-bf3fd59956aa/1689819925822/logo.png :: net::ERR_TUNNEL_CONNECTION_FAILED
- badresponse: 401 GET http://mandurah.ovation.test:24624/api/auth/me

## leaderboard-sort
- console: [error] Failed to load resource: net::ERR_CONNECTION_RESET
- console: [error] Failed to load resource: the server responded with a status of 401 (Unauthorized)
- console: [error] Failed to load resource: the server responded with a status of 401 (Unauthorized)
- console: [error] Failed to load resource: net::ERR_TUNNEL_CONNECTION_FAILED
- requestfailed: GET https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap :: net::ERR_CONNECTION_RESET
- requestfailed: GET https://res.cloudinary.com/playhq/image/upload/v1/production/ca/84fe5d06-5eeb-4fe5-85d1-bf3fd59956aa/1689819925822/logo.png :: net::ERR_TUNNEL_CONNECTION_FAILED
- badresponse: 401 GET http://mandurah.ovation.test:24624/api/auth/me
- badresponse: 401 GET http://mandurah.ovation.test:24624/api/auth/me
- notes: sort click changed first row: White, Lucas	28	25	3	860	109	39.09	2	5	-	-	-	-	-	 -> White, Lucas	28	25	3	860	109	39.09	2	5	-	-	-	-	-	 (NO CHANGE — headers not sortable)