/**
 * Cake Designer — stylised fictional customers.
 *
 * Purely illustrative: each is a small set of tokens the <CustomerAvatar>
 * component turns into a layered SVG portrait (skin, hair shape, hair colour,
 * top colour, an accessory). No real people, no photos.
 */

export const CUSTOMERS = {
  emma:   { name: "Emma",   skin: "#f2c9a8", hair: "#3b2a20", style: "long",   top: "#ff9ec7", accent: "bow" },
  mia:    { name: "Mia",    skin: "#e6b48c", hair: "#1c1c22", style: "bun",    top: "#8be0ff", accent: "glasses" },
  sofia:  { name: "Sofia",  skin: "#c98d61", hair: "#241a12", style: "curly",  top: "#ffd166", accent: "hoops" },
  lily:   { name: "Lily",   skin: "#f4d3b8", hair: "#c98a3d", style: "wavy",   top: "#b6e3cd", accent: "flower" },
  chloe:  { name: "Chloe",  skin: "#eabf9a", hair: "#7b4a2d", style: "pony",   top: "#c9b8ec", accent: "none" },
  olivia: { name: "Olivia", skin: "#d9a074", hair: "#2e2b33", style: "long",   top: "#8fce8f", accent: "beret" },
  ava:    { name: "Ava",    skin: "#f2c9a8", hair: "#5c3520", style: "bob",    top: "#f7b8cf", accent: "none" },
  ella:   { name: "Ella",   skin: "#e6b48c", hair: "#111114", style: "wavy",   top: "#7fa8e6", accent: "hoops" },
  grace:  { name: "Grace",  skin: "#f4d3b8", hair: "#efe2c4", style: "bun",    top: "#efe2c4", accent: "pearls" },
  zoe:    { name: "Zoe",    skin: "#c98d61", hair: "#9d7fd1", style: "curly",  top: "#9d7fd1", accent: "star" },
  nora:   { name: "Nora",   skin: "#eabf9a", hair: "#3b2a20", style: "pony",   top: "#e0524f", accent: "none" },
  ruby:   { name: "Ruby",   skin: "#f2c9a8", hair: "#c13a37", style: "bob",    top: "#f7db8a", accent: "flower" },
};

export const customer = (id) => CUSTOMERS[id] || CUSTOMERS.emma;
