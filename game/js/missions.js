// Port Solano — "The Meridian Job": the six-mission story chain.
// Each mission sets objectives on the state; main.js renders the marker and
// pays out on completion. Missions 3–6 are original to this game.
import { fmtMoney } from './util.js';

export const MISSIONS = [
  {
    name: 'GETAWAY',
    briefing: 'Mara Voss: "The crew hit the marina vault. Cops are already on us — lose them and reach the gold marker."',
    payout: 800,
    timer: 180,
    setup(state, api) {
      api.setWanted(3);
      api.setMarker(140, 120, 'Safe house — reach the gold marker');
      state.objective = { x: 140, z: 120, label: 'Reach the gold marker' };
    },
    tick(state, api) {
      if (Math.hypot(state.player.x - 140, state.player.z - 120) < 9) return 'done';
      return null;
    },
  },
  {
    name: 'COURIER RUN',
    briefing: 'Mara Voss: "Three parcels, three drops, no questions. Drive fast, drive clean."',
    payout: 1200,
    timer: 240,
    setup(state, api) {
      api.setWanted(1);
      state.objectives = [
        { x: -120, z: 120, label: 'Drop 1/3 — Harbor Steps' },
        { x: 120, z: -120, label: 'Drop 2/3 — North Gate' },
        { x: -80, z: -80, label: 'Drop 3/3 — Meridian Plaza' },
      ];
      state.missionStage = 0;
      const o = state.objectives[0];
      api.setMarker(o.x, o.z, o.label);
      state.objective = o;
    },
    tick(state, api) {
      const o = state.objectives[state.missionStage];
      if (!o) return 'done';
      const px = state.inCar && state.car ? state.car.x : state.player.x;
      const pz = state.inCar && state.car ? state.car.z : state.player.z;
      if (Math.hypot(px - o.x, pz - o.z) < 9) {
        api.feed('Parcel delivered — ' + fmtMoney(400));
        api.addCash(400);
        state.missionStage++;
        const next = state.objectives[state.missionStage];
        if (!next) return 'done';
        api.setMarker(next.x, next.z, next.label);
        state.objective = next;
        api.blip();
      }
      return null;
    },
  },
  {
    name: 'TAXI SHIFT',
    briefing: 'Mara Voss: "Lay low. Drive the cab, take three fares, pocket the cash. Passengers are waiting at the blue markers."',
    payout: 900,
    timer: 300,
    setup(state, api) {
      api.setWanted(0);
      state.objectives = [
        { x: 80, z: 40, label: 'Passenger 1/3 — Palm Row' },
        { x: -160, z: 80, label: 'Passenger 2/3 — West End' },
        { x: 120, z: -80, label: 'Passenger 3/3 — Marina' },
      ];
      state.missionStage = 0;
      state.taxiFare = 0;
      const o = state.objectives[0];
      api.setMarker(o.x, o.z, o.label, 0x3fa7ff);
      state.objective = o;
    },
    tick(state, api) {
      const o = state.objectives[state.missionStage];
      if (!o) return 'done';
      const px = state.inCar && state.car ? state.car.x : state.player.x;
      const pz = state.inCar && state.car ? state.car.z : state.player.z;
      if (Math.hypot(px - o.x, pz - o.z) < 8) {
        const fare = 180 + Math.floor(Math.random() * 120);
        state.taxiFare += fare;
        api.feed('Fare collected — ' + fmtMoney(fare));
        api.addCash(fare);
        state.missionStage++;
        const next = state.objectives[state.missionStage];
        if (!next) return 'done';
        api.setMarker(next.x, next.z, next.label, 0x3fa7ff);
        state.objective = next;
        api.blip();
      }
      return null;
    },
  },
  {
    name: 'CHOP SHOP',
    briefing: 'Mara Voss: "A gold Comet GT is parked uptown. Steal it — F next to it on foot — and deliver it to the Chop Shop in one piece."',
    payout: 2500,
    timer: 300,
    setup(state, api) {
      api.setWanted(1);
      const car = api.spawnChopCar();
      state.chopTarget = car;
      api.setMarker(car.x, car.z, 'Steal the gold Comet GT', 0xffd25a);
      state.objective = { x: car.x, z: car.z, label: 'Steal the gold Comet GT' };
      state.missionStage = 0;
    },
    tick(state, api) {
      if (state.missionStage === 0) {
        if (state.car && state.car.isChopCar) {
          state.missionStage = 1;
          api.setMarker(-120, -20, 'Deliver the Comet to the Chop Shop');
          state.objective = { x: -120, z: -20, label: 'Deliver the Comet to the Chop Shop' };
          api.feed('Got it. Now get it to the Chop Shop — no dents, no cops.');
        }
        return null;
      }
      const px = state.car ? state.car.x : state.player.x;
      const pz = state.car ? state.car.z : state.player.z;
      if (state.car && state.car.isChopCar && Math.hypot(px + 120, pz + 20) < 10) return 'done';
      if (!state.car || !state.car.isChopCar) {
        state.objective = { x: -120, z: -20, label: 'Get back in the gold Comet!' };
      }
      return null;
    },
  },
  {
    name: 'HEIST SETUP',
    briefing: 'Mara Voss: "The Meridian Job needs three crates: drills, masks, getaway plates. Grab them all — and stay quiet."',
    payout: 3000,
    timer: 300,
    setup(state, api) {
      api.setWanted(0);
      state.objectives = [
        { x: -160, z: -140, label: 'Crate 1/3 — Drills, old depot' },
        { x: 160, z: 80, label: 'Crate 2/3 — Masks, marina lockup' },
        { x: 40, z: 160, label: 'Crate 3/3 — Plates, south yard' },
      ];
      state.missionStage = 0;
      state.crateCount = 0;
      const o = state.objectives[0];
      api.setMarker(o.x, o.z, o.label, 0x7be495);
      state.objective = o;
      api.spawnCrates(state.objectives);
    },
    tick(state, api) {
      const o = state.objectives[state.missionStage];
      if (!o) return 'done';
      const px = state.player.x, pz = state.player.z;
      if (Math.hypot(px - o.x, pz - o.z) < 6) {
        state.crateCount++;
        api.feed('Crate secured (' + state.crateCount + '/3)');
        api.collectCrate(state.missionStage);
        state.missionStage++;
        const next = state.objectives[state.missionStage];
        if (!next) return 'done';
        api.setMarker(next.x, next.z, next.label, 0x7be495);
        state.objective = next;
        api.blip();
      }
      return null;
    },
  },
  {
    name: 'THE MERIDIAN JOB',
    briefing: 'Mara Voss: "This is it. Hit the Meridian Tower, grab the vault case, then run for the beach. The whole crew is counting on you, Rook."',
    payout: 50000,
    timer: 360,
    setup(state, api) {
      api.setWanted(2);
      api.setMarker(-60, -140, 'Enter the Meridian Tower', 0xffd25a);
      state.objective = { x: -60, z: -140, label: 'Reach the Meridian Tower' };
      state.missionStage = 0;
    },
    tick(state, api) {
      if (state.missionStage === 0) {
        if (Math.hypot(state.player.x + 60, state.player.z + 140) < 12) {
          state.missionStage = 1;
          api.setWanted(5);
          api.feed('Vault case grabbed! FIVE STARS — run for the beach!');
          api.setMarker(180, 0, 'Escape to the beach — the boat is waiting', 0x7be495);
          state.objective = { x: 180, z: 0, label: 'Escape to the beach' };
        }
        return null;
      }
      const px = state.inCar && state.car ? state.car.x : state.player.x;
      const pz = state.inCar && state.car ? state.car.z : state.player.z;
      if (Math.hypot(px - 180, pz - 0) < 10) return 'done';
      return null;
    },
  },
];

export function startMission(state, api, index) {
  state.missionIndex = index;
  state.missionStage = 0;
  state.missionTimer = MISSIONS[index].timer;
  state.missionActive = true;
  state.objectives = [];
  state.objective = null;
  MISSIONS[index].setup(state, api);
  api.feed('MISSION ' + (index + 1) + '/6: ' + MISSIONS[index].name + ' — ' + MISSIONS[index].briefing);
}

export function completeMission(state, api) {
  const m = MISSIONS[state.missionIndex];
  state.missionDone[state.missionIndex] = true;
  state.missionActive = false;
  api.addCash(m.payout);
  state.respect += 500 + state.missionIndex * 250;
  api.feed('MISSION COMPLETE — ' + m.name + ' — +' + fmtMoney(m.payout));
  api.missionDoneSound();
  api.clearMarker();
  if (state.missionIndex === 5) {
    state.mode = 'won';
    state.endReason = 'The Meridian Job is done. Rook takes the crew\'s $50,000 cut and sails out of Port Solano a legend.';
    return;
  }
  const next = state.missionIndex + 1;
  state.day = Math.min(7, state.day + 1);
  state.clockMin = 8 * 60;
  api.toast('Mission ' + (state.missionIndex + 1) + '/6 complete — Day ' + state.day + ' begins');
  startMission(state, api, next);
}

export function failMission(state, api, reason) {
  state.missionActive = false;
  api.feed('MISSION FAILED — ' + reason);
  api.failSound();
  api.clearMarker();
  // Restart the same mission after a short beat.
  state.missionTimer = 0;
  setTimeout(() => {
    if (state.mode === 'play') startMission(state, api, state.missionIndex);
  }, 1200);
}
