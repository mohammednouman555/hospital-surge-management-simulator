# SurgeResponse — Integrated Hospital Surge Management Simulator

A standalone React + Vite planning demonstration for a mass-casualty surge. It models **one coordinated response plan**, combining local capacity mobilisation with regional transfers rather than presenting them as competing strategies.

## Demonstration scenario

- 100 existing patients at the affected hospital
- 500 incoming patients after a mass-casualty incident
- Editable local beds, additional beds, doctors, nurses, equipment, supply patient-days, staffing ratios, mobilisation time and response window
- Editable receiving-hospital capacities, transfer limits, travel times and modeled critical-care capability
- Editable aggregate incoming acuity mix (critical, urgent and stable)

## Integrated planning logic

1. Calculates effective local capacity from the tightest modeled constraint: physical beds, doctor-supported capacity, nurse-supported capacity, equipment, local treatment limit and supplies.
2. Protects capacity for existing patients, then estimates how many incoming patients can be accommodated locally.
3. Estimates the incoming acuity mix using the configured percentages and deterministic integer rounding.
4. Allocates modeled critical transfers to critical-care-capable receiving sites first, ordered by travel time.
5. Allocates remaining urgent/stable demand to available regional capacity, respecting each site's transfer limit and the global ambulance/coordination limits.
6. Reports unresolved demand, resource gaps, risks, illustrative mobilisation costs and response-window concerns instead of silently treating gaps as solved.

## Run locally

Requires Node.js 18+ and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

## Verify

```bash
npm test
npm run build
npm run preview
```

## Project structure

- `src/App.jsx` — dashboard and editable planning controls
- `src/simulation.js` — deterministic integrated allocation and validation logic
- `src/styles.css` — responsive visual design
- `tests/simulation.test.js` — automated logic tests

## Important scope and safety boundaries

This is a **simulation / planning prototype**, not a clinically validated tool or live hospital command system. It has no live hospital feeds, electronic health records, ambulance dispatch, procurement integration, live map routing, user authentication, audit logging, or patient-level triage. Aggregate acuity percentages are not a substitute for clinical triage. Critical-care suitability is represented only by a user-entered capability flag. Staffing ratios, cost estimates, transport limits and timing assumptions are illustrative. The model does not account for specialty matching, infection control, shift schedules, transport clinical clearance, legal transfer approvals, or receiving-facility acceptance.

For real-world use, the system would require verified data feeds, explicit permissions, cybersecurity and privacy controls, clinician-led protocols, emergency-management integration, model validation, accessibility testing, operational drills and formal safety approval. Always follow qualified clinical command and local emergency procedures.
