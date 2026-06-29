# Reef Keeper Roadmap

*Last updated: June 2026*

## Guiding Principles

-   One source of truth: Reef Brain
-   Build intelligence before adding new screens
-   Every release: Feature Branch → Preview → Merge

## Completed

### v3.7.0 -- Equipment Intelligence ✅

### v3.8.0 -- Reef Timeline ✅

### v3.8.1 -- Timeline Polish ✅

### v3.9.0 -- Timeline Intelligence (Current)

-   Coral growth timelines
-   Fish history
-   Equipment history
-   Parameter trend markers
-   Before/after photo comparison
-   AI summaries
-   Milestones

## Planned

### v4.0 -- Apex Integration

-   Live Apex probes
-   Outlet status
-   Alarm synchronization
-   Reef Brain integration

### v4.1 -- Native Apex Driver / Connector Push / Reef Copilot

-   Native Apex LAN `/rest/status` parser
-   Read local probes, outlets, alerts, modules, and leak sensors
-   Connector Push for anywhere telemetry via Reef Keeper Cloud
-   Feed Apex telemetry into Reef Brain
-   Reef Copilot follows after native Apex data is stable

### v4.2 -- AI Vision Progress

-   Coral growth tracking
-   Fish health history
-   Before/after comparison

### v4.3 -- Predictive Reef Brain

-   Trend prediction
-   Adaptive maintenance
-   Personalized recommendations

### v5.0 -- Reef Operating System

-   Unified intelligence engine
-   Daily brief
-   Weekly reports
-   Full reef command center

## Release Workflow

1.  Feature branch
2.  Vercel Preview
3.  Test
4.  Merge
5.  Update CHANGELOG.md
6.  Update ROADMAP.md


## Current Release Notes

### v4.1.1 – Connector Push Foundation
- Local Apex connector script
- `/api/telemetry` cloud endpoint
- Vercel KV durable telemetry option
- Fetch Cloud Telemetry in Apex Integration

### v4.1.0 – Native Apex Driver
- Local Apex LAN `/rest/status` support
- Native probe and outlet parser
- Apex telemetry import into Reef Brain
- Bridge/manual JSON fallback remains available
