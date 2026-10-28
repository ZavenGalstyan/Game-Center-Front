/**
 * Last Hope — loot tables.
 *
 * A table is { rolls: [min, max], items: [[id, weight, min, max], …] }.
 * Containers name a table; zombies and animals use the `drop:` tables.
 * Unique containers (quest items) have fixed `contents` in the location data
 * instead and never refill.
 */
export const LOOT = {
  // ---------------------------------------------------------------- camp / forest
  camp_crate: { rolls: [2, 3], items: [["wood", 4, 2, 4], ["fiber", 4, 2, 4], ["cloth", 3, 1, 3], ["berries", 3, 2, 4], ["empty_bottle", 2, 1, 1], ["bandage", 1, 1, 1]] },
  hunter_chest: { rolls: [2, 4], items: [["arrow", 3, 3, 6], ["cloth", 3, 2, 4], ["rope", 3, 1, 2], ["raw_meat", 2, 1, 2], ["canned_food", 2, 1, 1], ["bandage", 2, 1, 2], ["water_bottle", 2, 1, 1], ["empty_bottle", 2, 1, 2]] },
  backpack_pile: { rolls: [1, 3], items: [["cloth", 4, 1, 3], ["energy_bar", 2, 1, 1], ["soda", 2, 1, 1], ["empty_bottle", 3, 1, 1], ["rope", 2, 1, 1], ["bandage", 2, 1, 1], ["painkillers", 1, 1, 1]] },

  // ---------------------------------------------------------------- suburb
  fridge: { rolls: [1, 3], items: [["canned_food", 5, 1, 2], ["soda", 5, 1, 2], ["water_bottle", 3, 1, 1], ["energy_bar", 2, 1, 1]] },
  cabinet: { rolls: [2, 3], items: [["cloth", 5, 1, 3], ["rope", 2, 1, 1], ["bandage", 3, 1, 2], ["painkillers", 2, 1, 1], ["canned_food", 2, 1, 1], ["empty_bottle", 2, 1, 1], ["chemicals", 1, 1, 1]] },
  wardrobe: { rolls: [1, 3], items: [["cloth", 7, 2, 4], ["padded_hood", 1, 1, 1], ["cloth_pants", 1, 1, 1], ["work_boots", 1, 1, 1], ["small_backpack", 1, 1, 1], ["hiking_backpack", 0.4, 1, 1]] },
  toolbox: { rolls: [2, 3], items: [["metal", 5, 1, 3], ["parts", 2, 1, 1], ["rope", 3, 1, 2], ["crowbar", 0.8, 1, 1], ["fire_axe", 0.4, 1, 1], ["machete", 0.4, 1, 1]] },
  medcab: { rolls: [1, 3], items: [["bandage", 5, 1, 3], ["painkillers", 4, 1, 2], ["antidote", 1, 1, 1], ["medkit", 1, 1, 1], ["chemicals", 2, 1, 1]] },
  store_shelf: { rolls: [2, 4], items: [["canned_food", 5, 1, 2], ["soda", 5, 1, 3], ["energy_bar", 4, 1, 2], ["water_bottle", 4, 1, 2], ["empty_bottle", 2, 1, 2], ["painkillers", 1, 1, 1]] },
  police_car: { rolls: [1, 3], items: [["pistol_ammo", 4, 3, 8], ["bandage", 3, 1, 2], ["riot_helmet", 0.5, 1, 1], ["metal", 3, 1, 2], ["parts", 1, 1, 1]] },
  car_trunk: { rolls: [1, 3], items: [["metal", 4, 1, 2], ["cloth", 3, 1, 2], ["rope", 2, 1, 1], ["soda", 2, 1, 1], ["parts", 1, 1, 1], ["water_bottle", 1, 1, 1]] },

  // ---------------------------------------------------------------- industrial
  locker: { rolls: [2, 3], items: [["cloth", 3, 1, 3], ["hard_hat", 1, 1, 1], ["work_boots", 1, 1, 1], ["energy_bar", 3, 1, 1], ["painkillers", 2, 1, 1], ["pistol_ammo", 1, 2, 5], ["hiking_backpack", 0.5, 1, 1]] },
  metal_crate: { rolls: [2, 4], items: [["metal", 6, 2, 4], ["parts", 3, 1, 2], ["rope", 2, 1, 2], ["chemicals", 2, 1, 1], ["crowbar", 0.5, 1, 1]] },
  chem_barrel: { rolls: [1, 2], items: [["chemicals", 6, 1, 2], ["metal", 2, 1, 1]] },
  container: { rolls: [2, 4], items: [["metal", 4, 2, 5], ["cloth", 3, 2, 4], ["parts", 2, 1, 2], ["canned_food", 2, 1, 2], ["water_bottle", 1, 1, 1], ["hiking_backpack", 0.4, 1, 1], ["fire_axe", 0.3, 1, 1]] },

  // ---------------------------------------------------------------- bunker
  mil_crate: { rolls: [2, 4], items: [["pistol_ammo", 5, 6, 12], ["rifle_ammo", 2, 4, 10], ["medkit", 2, 1, 1], ["energy_bar", 3, 1, 2], ["parts", 3, 1, 2], ["chemicals", 2, 1, 2], ["combat_pants", 0.5, 1, 1]] },
  bunker_locker: { rolls: [2, 3], items: [["cloth", 3, 2, 3], ["energy_bar", 3, 1, 2], ["water_bottle", 3, 1, 1], ["pistol_ammo", 3, 4, 8], ["medkit", 1, 1, 1], ["combat_pants", 0.5, 1, 1]] },
  lab_cabinet: { rolls: [2, 3], items: [["chemicals", 5, 1, 3], ["antidote", 3, 1, 2], ["medkit", 2, 1, 1], ["painkillers", 3, 1, 2]] },

  // ---------------------------------------------------------------- zombie / animal drops
  walker: { rolls: [0, 1], items: [["cloth", 5, 1, 2], ["fiber", 2, 1, 2], ["canned_food", 0.6, 1, 1], ["soda", 0.6, 1, 1], ["bandage", 0.6, 1, 1]] },
  runner: { rolls: [0, 1], items: [["cloth", 5, 1, 2], ["energy_bar", 1, 1, 1], ["rope", 1, 1, 1], ["painkillers", 0.5, 1, 1]] },
  armored: { rolls: [1, 2], items: [["metal", 5, 1, 3], ["cloth", 3, 1, 2], ["pistol_ammo", 2, 2, 5], ["riot_helmet", 0.35, 1, 1], ["parts", 1, 1, 1]] },
  toxic: { rolls: [1, 1], items: [["chemicals", 5, 1, 1], ["cloth", 2, 1, 2], ["antidote", 0.6, 1, 1]] },
  brute: { rolls: [3, 4], items: [["metal", 4, 3, 5], ["parts", 3, 1, 3], ["chemicals", 2, 1, 2], ["medkit", 2, 1, 1]] },
};
