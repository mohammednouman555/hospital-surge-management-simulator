export const DEFAULTS = {
  incidentName: 'Regional mass-casualty incident', existingPatients: 100, incomingPatients: 500,
  currentBeds: 100, expansionBeds: 160, currentDoctors: 10, addedDoctors: 24,
  currentNurses: 20, addedNurses: 48, currentEquipment: 100, addedEquipment: 180,
  bedsPerDoctor: 12, bedsPerNurse: 6, equipmentPerPatient: 1,
  incomingCriticalPct: 15, incomingUrgentPct: 35, incomingStablePct: 50,
  localTreatmentLimit: 600, localSuppliesPatientDays: 360, suppliesPerPatient: 1,
  ambulanceSlots: 180, transferSlots: 500, transferCostPerPatient: 4500,
  expansionCostPerBed: 18000, doctorCost: 90000, nurseCost: 45000, equipmentCost: 25000,
  mobilisationHours: 6, responseWindowHours: 12,
  partnerHospitals: [
    { id: 1, name: 'North General', capacity: 180, currentPatients: 100, transferLimit: 160, equippedForCritical: true, travelMinutes: 25 },
    { id: 2, name: 'Central Medical', capacity: 150, currentPatients: 90, transferLimit: 130, equippedForCritical: true, travelMinutes: 35 },
    { id: 3, name: 'Riverside Hospital', capacity: 220, currentPatients: 150, transferLimit: 180, equippedForCritical: false, travelMinutes: 45 }
  ]
};
const n = v => Math.max(0, Math.floor(Number(v) || 0));
const money = v => Math.max(0, Number(v) || 0);
const ceil = v => Math.ceil(Math.max(0, Number(v) || 0));
const clampPct = v => Math.min(100, n(v));

// Split an aggregate cohort using the entered mix. Largest-remainder rounding ensures
// the integer cohort sums to exactly the number of patients being allocated.
function splitAcuity(total, percentages) {
  if (!total) return { critical: 0, urgent: 0, stable: 0 };
  const raw = percentages.map(p => total * p / 100);
  const values = raw.map(Math.floor);
  let left = total - values.reduce((sum, v) => sum + v, 0);
  const order = raw.map((v, i) => ({ i, remainder: v - Math.floor(v) })).sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < left; i++) values[order[i % order.length].i]++;
  return { critical: values[0], urgent: values[1], stable: values[2] };
}

export function simulateIntegrated(c) {
  const existing = n(c.existingPatients), incoming = n(c.incomingPatients), demand = existing + incoming;
  const physicalBeds = n(c.currentBeds) + n(c.expansionBeds);
  const doctors = n(c.currentDoctors) + n(c.addedDoctors), nurses = n(c.currentNurses) + n(c.addedNurses);
  const doctorCapacity = doctors * Math.max(1, n(c.bedsPerDoctor));
  const nurseCapacity = nurses * Math.max(1, n(c.bedsPerNurse));
  const equipment = n(c.currentEquipment) + n(c.addedEquipment);
  const equipmentCapacity = Math.floor(equipment / Math.max(1, n(c.equipmentPerPatient)));
  const staffedCapacity = Math.min(physicalBeds, doctorCapacity, nurseCapacity, equipmentCapacity, n(c.localTreatmentLimit));
  const supplyCapacity = Math.floor(n(c.localSuppliesPatientDays) / Math.max(1, n(c.suppliesPerPatient)));
  const localUsableCapacity = Math.min(staffedCapacity, supplyCapacity);
  const localIncomingCapacity = Math.max(0, localUsableCapacity - existing);
  const localAccepted = Math.min(incoming, localIncomingCapacity);

  const percentages = [clampPct(c.incomingCriticalPct), clampPct(c.incomingUrgentPct), clampPct(c.incomingStablePct)];
  const incomingMix = splitAcuity(incoming, percentages);
  const localMix = splitAcuity(localAccepted, percentages);
  const transferAcuity = {
    critical: Math.max(0, incomingMix.critical - localMix.critical),
    urgent: Math.max(0, incomingMix.urgent - localMix.urgent),
    stable: Math.max(0, incomingMix.stable - localMix.stable)
  };

  const partners = (c.partnerHospitals || []).map(h => {
    const capacity = n(h.capacity), currentPatients = n(h.currentPatients);
    const spare = Math.max(0, capacity - currentPatients);
    return { ...h, capacity, currentPatients, spare, availableSlots: Math.min(spare, n(h.transferLimit)), allocated: 0, criticalAllocated: 0, otherAllocated: 0 };
  });
  const globalTransferLimit = Math.min(n(c.transferSlots), n(c.ambulanceSlots));
  let remainingGlobalSlots = globalTransferLimit;
  let criticalRemaining = transferAcuity.critical;

  // Phase 1: critical cohort only goes to facilities marked as critical-care capable.
  const criticalSites = [...partners].filter(h => h.equippedForCritical).sort((a, b) => n(a.travelMinutes) - n(b.travelMinutes));
  for (const h of criticalSites) {
    const amount = Math.min(criticalRemaining, h.availableSlots, remainingGlobalSlots);
    h.criticalAllocated += amount; h.allocated += amount;
    criticalRemaining -= amount; remainingGlobalSlots -= amount;
    if (!criticalRemaining || !remainingGlobalSlots) break;
  }

  // Phase 2: allocate urgent/stable demand to remaining suitable capacity, nearest first.
  let otherRemaining = transferAcuity.urgent + transferAcuity.stable;
  const otherSites = [...partners].sort((a, b) => n(a.travelMinutes) - n(b.travelMinutes));
  for (const h of otherSites) {
    const spareAfterCritical = Math.max(0, h.availableSlots - h.allocated);
    const amount = Math.min(otherRemaining, spareAfterCritical, remainingGlobalSlots);
    h.otherAllocated += amount; h.allocated += amount;
    otherRemaining -= amount; remainingGlobalSlots -= amount;
    if (!otherRemaining || !remainingGlobalSlots) break;
  }

  const allocations = partners.map(h => ({
    ...h,
    remainingCapacity: Math.max(0, h.availableSlots - h.allocated),
    utilizationAfter: h.capacity > 0 ? Math.min(100, (h.currentPatients + h.allocated) / h.capacity * 100) : 0
  }));
  const transferred = allocations.reduce((sum, h) => sum + h.allocated, 0);
  const criticalTransferred = allocations.reduce((sum, h) => sum + h.criticalAllocated, 0);
  const accommodated = localAccepted + transferred;
  const unplaced = Math.max(0, incoming - accommodated);
  const criticalUnmatched = criticalRemaining;

  const localResourceGaps = {
    beds: Math.max(0, demand - physicalBeds),
    doctors: Math.max(0, ceil(demand / Math.max(1, n(c.bedsPerDoctor))) - doctors),
    nurses: Math.max(0, ceil(demand / Math.max(1, n(c.bedsPerNurse))) - nurses),
    equipment: Math.max(0, demand * Math.max(1, n(c.equipmentPerPatient)) - equipment),
    supplies: Math.max(0, demand * Math.max(1, n(c.suppliesPerPatient)) - n(c.localSuppliesPatientDays))
  };
  const expansionCost = n(c.expansionBeds) * money(c.expansionCostPerBed)
    + n(c.addedDoctors) * money(c.doctorCost)
    + n(c.addedNurses) * money(c.nurseCost)
    + n(c.addedEquipment) * money(c.equipmentCost);
  const transferCost = transferred * money(c.transferCostPerPatient);
  const responseWithinWindow = n(c.mobilisationHours) <= n(c.responseWindowHours);
  const risks = [];
  if (unplaced > 0) risks.push(`${unplaced} patients remain without a modeled placement; escalate regional mutual aid and additional surge capacity.`);
  if (criticalUnmatched > 0) risks.push(`${criticalUnmatched} critical patients lack modeled capacity at a critical-care-capable receiving site; activate specialist coordination immediately.`);
  if (supplyCapacity < staffedCapacity) risks.push('Supplies are the local capacity bottleneck; beds and staff alone do not increase usable capacity.');
  if (!responseWithinWindow) risks.push('Estimated local mobilisation time exceeds the response window; arrange interim transfers and staged activation.');
  if (globalTransferLimit < Math.max(0, incoming - localAccepted)) risks.push('Ambulance or transfer-coordination slots constrain the modeled regional response.');
  if (allocations.some(h => h.utilizationAfter >= 95 && h.allocated > 0)) risks.push('At least one receiving hospital approaches modeled full occupancy; confirm safe operational reserve before accepting transfers.');
  if (!risks.length) risks.push('All modeled patients have a placement under current assumptions. Confirm real-time staffing, clinical suitability, supplies and receiving-facility acceptance.');

  const recommendations = [
    `Protect capacity for ${existing} existing patients and accept up to ${localAccepted} incoming patients locally within modeled usable capacity (${localUsableCapacity} total).`,
    ...(transferred ? [`Coordinate ${transferred} regional transfers across ${allocations.filter(h => h.allocated > 0).length} receiving hospitals; ${criticalTransferred} are modeled for critical-care-capable sites.`] : []),
    ...(criticalUnmatched ? [`Escalate ${criticalUnmatched} critical patients for specialist placement; do not route them to a facility without modeled critical-care capability.`] : []),
    ...(unplaced ? [`Maintain an explicit unresolved-demand register for ${unplaced} patients and request additional regional mutual aid.`] : []),
    ...((localResourceGaps.beds || localResourceGaps.doctors || localResourceGaps.nurses || localResourceGaps.equipment || localResourceGaps.supplies) ? ['Mobilise the resource categories shown in the gap analysis; effective capacity is constrained by the tightest resource.'] : []),
    ...( !responseWithinWindow ? ['Use regional transfers as an interim bridge while local expansion resources are mobilised.'] : [])
  ];
  return {
    existing, incoming, demand, physicalBeds, doctors, nurses, equipment, doctorCapacity, nurseCapacity,
    equipmentCapacity, staffedCapacity, supplyCapacity, localUsableCapacity, localIncomingCapacity,
    localAccepted, localAcuity: localMix, incomingAcuity: incomingMix, transferAcuity,
    allocations, transferred, criticalTransferred, accommodated, unplaced,
    successRate: demand ? accommodated / demand * 100 : 100, expansionCost, transferCost,
    totalCost: expansionCost + transferCost, localResourceGaps,
    critical: incomingMix.critical, urgent: incomingMix.urgent, stable: incomingMix.stable,
    criticalUnmatched, localLoadPct: localUsableCapacity ? Math.min(100, (existing + localAccepted) / localUsableCapacity * 100) : 100,
    responseWithinWindow, risks, recommendations, transferSlots: n(c.transferSlots), ambulanceSlots: n(c.ambulanceSlots),
    remainingTransferSlots: remainingGlobalSlots
  };
}

export function validateScenario(c) {
  const errors = [];
  const numericKeys = ['existingPatients','incomingPatients','currentBeds','expansionBeds','currentDoctors','addedDoctors','currentNurses','addedNurses','currentEquipment','addedEquipment','localTreatmentLimit','localSuppliesPatientDays','ambulanceSlots','transferSlots','mobilisationHours','responseWindowHours'];
  for (const k of numericKeys) if (Number(c[k]) < 0 || !Number.isFinite(Number(c[k]))) errors.push(`${k} must be a non-negative number.`);
  for (const h of c.partnerHospitals || []) {
    if (n(h.currentPatients) > n(h.capacity)) errors.push(`${h.name}: current patients exceed modeled bed capacity.`);
    if (n(h.travelMinutes) < 0) errors.push(`${h.name}: travel time must be non-negative.`);
  }
  const mix = n(c.incomingCriticalPct) + n(c.incomingUrgentPct) + n(c.incomingStablePct);
  if (mix !== 100) errors.push('Patient acuity percentages must total 100%.');
  if ([c.bedsPerDoctor,c.bedsPerNurse,c.equipmentPerPatient,c.suppliesPerPatient].some(v => n(v) < 1)) errors.push('Resource ratios must be at least 1.');
  return [...new Set(errors)];
}
