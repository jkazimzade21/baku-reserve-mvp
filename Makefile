ENRICH_SLUGS ?=
PERF_URL ?= http://localhost:8081
DOC_QUERY ?=
SENTRY_ORG ?= baku-reserve
SENTRY_PROJECT ?= concierge-ai
SENTRY_TEAM ?= platform
SENTRY_PLATFORM ?= python

.PHONY: enrich perf ref-docs sentry-bootstrap doctor

enrich:
	@python3 scripts/enrich_baku.py $(if $(ENRICH_SLUGS),--slugs $(ENRICH_SLUGS),)

perf:
	@node tools/e2e_perf.mjs --url $(PERF_URL)

ref-docs:
	@if [ -z "$(DOC_QUERY)" ]; then \
		echo "Usage: make ref-docs DOC_QUERY='expo font sdk'"; \
		exit 1; \
	fi
	@node scripts/ref_docs.mjs --query "$(DOC_QUERY)"

sentry-bootstrap:
	@node scripts/sentry_bootstrap.mjs --org $(SENTRY_ORG) --project $(SENTRY_PROJECT) --team $(SENTRY_TEAM) --platform $(SENTRY_PLATFORM)

doctor:
	@scripts/dev_doctor.sh
