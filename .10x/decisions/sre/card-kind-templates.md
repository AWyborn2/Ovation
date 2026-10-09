# SRE — card-kind-templates

## Failure modes and signals (2026-10-08)

| Failure                                        | Effect                                                                                           | Signal                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| No render harness in production                | Layout checks skipped; templated drafts stay "Checking layout" and never auto-post (fail closed) | Log `layout checks skipped: no render harness configured` (warn, per tenant per sweep) |
| Harness errors / timeouts                      | That draft stays pending; retried next hourly sweep                                              | Log `layout check failed; draft stays out of automation` (warn, with draftId)          |
| Text overflows / font fails / >10 slides       | Draft badged "Needs a look"; skipped by auto-promotion and auto-publish                          | Queue filter count; `layout_warnings` non-empty                                        |
| Publish-time render warns on an automatic post | Publication fails permanently with a "needs a look" message; warning stored on the draft         | Existing publish failure path (`recordFailure`), message names the reason              |
| Two admins save the same template              | Second save gets 409 with who saved; nothing overwritten                                         | API 409s on `PUT /api/kind-templates/:kind`                                            |
| Large backlog of pending checks                | At most 20 checks per club per sweep (`LAYOUT_CHECKS_PER_SWEEP`), so a sweep can't stall         | Sweep duration in logs                                                                 |

## Operational queries

- Drafts waiting on a layout check: `select tenant_id, count(*) from social_drafts where layout_check_pending and status in ('awaiting_review','ready') group by 1;`
- Drafts needing a look: `select tenant_id, count(*) from social_drafts where template_version is not null and layout_warnings::text ~ '"reason"' and status in ('awaiting_review','ready') group by 1;`

## SLO stance

No new SLO. Card generation stays best-effort on the hourly sweep; the guarantee this feature adds is a safety one: a templated card that hasn't been checked, or fails its check, is never posted automatically.
