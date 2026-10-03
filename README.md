# ClaimBoard — Production-Grade Manga Scanlation Management Platform

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)](https://www.typescriptlang.org/)
[![Turborepo](https://img.shields.io/badge/Monorepo-Turborepo-ef4444.svg)](https://turbo.build/)
[![Fastify](https://img.shields.io/badge/Backend-Fastify_5-000000.svg)](https://fastify.dev/)
[![React](https://img.shields.io/badge/Frontend-React_18_%2B_Vite-61dafb.svg)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind_CSS-38bdf8.svg)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**ClaimBoard** is a Discord-first production work management platform purpose-built for manga, manhwa, and manhua scanlation organizations. ClaimBoard replaces ad-hoc spreadsheets, pinned Discord messages, and chaotic threads with a rigorous, high-velocity production system modeled on Linear, GitHub Projects, and modern publishing workflows.

---

## 🏗️ Architecture & Philosophy

The entire platform revolves around the core scanlation hierarchy:

```text
Manga Series
    └── Chapter / Volume
            └── Work Assignment (Production Slot: Raw, TL, PR, Cleaning, Redraw, Typeset, QC, Upload)
                    └── Claim (Atomic Slot Holding)
                            └── Production & Deliverables
                                    └── Review & QC Revisions
                                            └── Completion & Downstream Unblocking
```

### Key Architectural Tenets

1. **Work Assignments vs. Claims:** A work assignment represents an individual production slot (e.g. *One Piece #1150 — Cleaning*). A claim represents a worker holding and actively producing that slot.
2. **Atomic Concurrency Protection:** Work claiming is guaranteed race-condition safe via MongoDB atomic operations (`findOneAndUpdate` with strict state conditions and version checking). Two workers clicking "Claim" simultaneously will never result in duplicate claims.
3. **Automated Pipeline Dependencies:** Dependent production steps (e.g. Typesetting waiting on Cleaning & Proofreading) remain blocked until all prerequisites reach `COMPLETED`. When QC approves preceding work, downstream tasks automatically unblock in real time.
4. **Discord-First Synchronization:** The Discord bot and Web frontend execute the **exact same shared business logic** (`ProductionService`). Changes made in Discord immediately reflect on the web dashboard via WebSockets without page refreshes.

---

## 📦 Monorepo Structure

```text
claimboard/
├── apps/
│   ├── web/               # Vite + React 18 + TS + Tailwind + TanStack Query + Zustand
│   ├── api/               # Fastify 5 + WebSockets + Zod + Mongoose + Modular Controllers
│   └── discord-bot/       # Discord.js bot with slash commands, role pings & buttons
│
├── packages/
│   ├── shared/            # Shared DTOs, Zod schemas, constants, error codes, and types
│   ├── database/          # Mongoose models, connection with in-memory fallback, shared services
│   ├── auth/              # Granular RBAC, session management, password hashing
│   ├── ui/                # Shared design tokens and utilities
│   ├── config/            # Strict Zod environment variable parsing with fail-fast validation
│   └── eslint-config/     # Workspace linting configuration
│
├── package.json           # Workspace scripts
├── pnpm-workspace.yaml    # Workspace package definitions
└── turbo.json             # Turborepo task pipeline
```

---

## ⚡ Quick Start

### Prerequisites

- **Node.js** >= 20.x
- **pnpm** >= 9.x
- **MongoDB** (optional in development; includes automatic embedded in-memory fallback)

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Build All Packages & Applications

```bash
pnpm build
```

### 3. Seed Database with Realistic Demo Data

ClaimBoard comes pre-configured with a rich seed dataset including demo manga (*One Piece*, *Solo Leveling*, *Jujutsu Kaisen*), realistic chapters, work assignments across all lifecycle states, deliverables with revisions, activity feeds, and demo accounts:

```bash
pnpm seed
```

### 4. Run Development Servers

```bash
# Starts both the Fastify API (port 4000) and Vite Web UI (port 5173) in parallel
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 👥 Demo User Accounts

You can log in using either the 1-click evaluation buttons on `/auth/login` or via credentials:

| Name | Role | Email | Password | Primary Capabilities |
| :--- | :--- | :--- | :--- | :--- |
| **Aria** | Administrator | `admin@claimboard.dev` | `password123` | Full administrative control, RBAC, reassignments, audits |
| **Ken** | Manager | `manager@claimboard.dev` | `password123` | Pipeline oversight, assignments, template management |
| **Abdullah** | Worker | `abdullah@claimboard.dev` | `password123` | Claiming tasks, deliverable uploads, unclaiming |
| **Rahim** | Worker | `rahim@claimboard.dev` | `password123` | Typesetting claims, submission history |
| **Sami** | Reviewer | `reviewer@claimboard.dev` | `password123` | QC inspection, approve work, request revision changes |

---

## 🚀 Discord Integration

ClaimBoard features a dedicated Discord bot with slash commands:

* `/assign chapter:<num> types:<codes> [manga:<title>] [priority:<level>] [description:<notes>]`
  * Automatically detects manga from channel mapping
  * Creates chapter and sequential assignments
  * Pings mapped roles (e.g. `@Cleaner`, `@Typesetter`)
  * Posts interactive announcement embed with claim buttons
* `/claim [work_type:<code>]` — Claim an open task directly from Discord
* `/unclaim task_id:<id> [reason:<notes>]` — Release an active claim
* `/myclaims` — Ephemeral private response listing active tasks and deadlines
* `/seeclaims [manga:<title>]` — Public status overview of chapter production
* `/board` — Direct private link to personal ClaimBoard workspace
* `/manga [title:<name>]` — Details and chapter counts
* `/progress` — ASCII pipeline progression for active releases

---

## 🎨 Design Philosophy & UX Highlights

- **Linear-Inspired Neutral Theme:** Sleek dark mode (`zinc-950` / `zinc-900` / `zinc-800`), refined typography (Inter & JetBrains Mono), restrained borders, and semantic status accents (Emerald for success, Amber for warning, Rose for error, Indigo for primary).
- **Command Palette (`Ctrl+K`):** Global permission-aware command palette with instant search and shortcuts (`G` for Dashboard, `O` for Open Work, `M` for My Claims, `P` for Pipeline, `A` for Admin, `/` for search).
- **Live Real-time Sync:** WebSockets broadcast changes immediately (`assignment.claimed`, `claim.updated`, `notification.created`), updating TanStack Query caches without page refreshes.
- **Production Velocity & Bottleneck Detection:** Real-time analytics breaking down active work time, idle waiting time, review turnaround, and release velocity.

---

## 🛡️ Granular Permissions (RBAC)

Fastify API endpoints strictly verify server-side authorization:

```text
users.view, users.create, users.edit, users.delete
manga.view, manga.create, manga.edit, manga.delete
assignments.view, assignments.create, assignments.edit, assignments.delete
claims.create, claims.cancel, claims.reassign, claims.complete
pipeline.view, pipeline.manage
analytics.view, discord.manage, settings.manage, audit.view
```

---

## 📄 License

MIT © ClaimBoard Contributors
