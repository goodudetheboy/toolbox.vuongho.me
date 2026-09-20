# 0002. One shared GCP project (`vuonghome`) across all *.vuongho.me subdomains

Status: Accepted

## Context

`toolbox.vuongho.me` is the first of several planned `*.vuongho.me`
subdomains/projects. Each could get its own GCP project (max isolation, more
IAM/billing setup per subdomain) or all share one project (simpler
management, shared blast radius). For a personal domain with several small
side projects, a fresh GCP project per subdomain was judged as unnecessary
setup overhead.

## Decision

One GCP project, `vuonghome`, shared by every `*.vuongho.me` subdomain,
including this repo's `toolbox` subdomain. Resources within it are kept from
colliding by naming convention rather than project boundaries — see
[0006](0006-per-tool-backend-and-firestore-naming.md).

## Consequences

- One billing account, one IAM setup, no new-project ceremony when a new
  subdomain project starts.
- Shared blast radius: a quota issue, leaked key, or billing spike in one
  subdomain's resources affects the same project boundary as every other
  subdomain. Accepted as a reasonable trade for personal-scale projects.
- Firebase Hosting's multi-site feature is what actually separates
  subdomains within this one project — each subdomain gets its own Hosting
  site mapped to its own custom domain (see
  [0003](0003-single-hosting-site-path-routing.md)).
