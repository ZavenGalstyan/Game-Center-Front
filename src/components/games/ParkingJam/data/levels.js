/**
 * Parking Jam — handcrafted level maps. Format: see engine/level.js.
 * Every level is checked by tools/validateLevels.mjs (structure, exits,
 * DFS solve + replay, dependency depth). Order = level number.
 */
export const LEVEL_DEFS = [
  /* ================================================================
     WORLD 1 — SUNNY PARKING
     ================================================================ */
  {
    name: "Easy Exit",
    tip: "Tap a car with a clear path.",
    // A leaves at once; B (→) waits for A; C (↑) waits for B.
    map: `
      .. .. .. .. .. ..
      .. .. .. .. a^ ..
      .. b- b> .. a- ..
      .. c^ .. .. .. ..
      .. c- .. .. .. ..
    `,
    types: "a:sedan b:hatch c:compact",
  },
  {
    name: "Two Ways Out",
    tip: "Cars only drive forward — look for the windshield.",
    map: `
      .. .. .. .. .. ..
      .. a- a> .. b^ ..
      .. .. .. .. b- ..
      .. c^ d- d> .. ..
      .. c- .. .. .. ..
    `,
  },
  {
    name: "Left & Down",
    tip: "Cars can face any direction. Each one needs its own clear lane.",
    map: `
      .. a- .. .. .. ..
      .. av d- d> .. ..
      .. .. .. .. .. ..
      b< b- .. c^ .. ..
      .. .. .. c- .. ..
    `,
  },
  {
    name: "Five Spaces",
    map: `
      a- a> .. b- .. ..
      .. e^ .. bv .. ..
      .. e- .. .. .. d^
      .. .. .. c- c> d-
      .. .. .. .. .. ..
    `,
  },
  {
    name: "Tight Squeeze",
    tip: "Crowded! Find the one car that can already escape.",
    map: `
      a^ b- b> c^ ..
      a- .. .. c- ..
      d- d> e^ f- f>
      .. .. e- .. ..
    `,
  },
  {
    name: "Chain Reaction",
    map: `
      a- a> b- .. .. ..
      .. e^ bv .. .. ..
      .. e- .. f< f- ..
      d- c< c- g^ .. ..
      dv .. .. g- h- h>
    `,
  },
  {
    name: "Two Lanes",
    map: `
      a- a> b^ c- c> d^ ..
      .. .. b- g- .. d- ..
      e^ f- f> gv h- h> ..
      e- .. .. .. i^ .. ..
      .. j- j> .. i- .. ..
    `,
  },
  {
    name: "Roundabout",
    map: `
      a- b- b> c^ d- d> ..
      av .. .. c- .. e^ ..
      f- f> g^ h- h> e- ..
      .. .. g- .. i- i> j^
      k- k> .. .. .. .. j-
    `,
  },
  {
    name: "Side Street",
    map: `
      a^ b- b> c- d- d> e^ ..
      a- .. .. cv .. .. e- ..
      f- f> g^ .. h- h> i^ k-
      .. .. g- j- j> .. i- kv
      l< l- .. m- m> .. .. ..
    `,
  },
  {
    name: "Morning Rush",
    tip: "Bigger lots hide longer chains. Clear the outside first.",
    map: `
      a- a> b^ c- c> d^ e- e>
      f- .. b- g^ .. d- h^ ..
      fv i- i> g- j- j> h- k^
      l- .. m- m> .. n^ .. k-
      lv o< o- p^ .. n- q- q>
      .. .. .. p- r- r> .. ..
    `,
  },
  {
    name: "Mixed Signals",
    map: `
      a^ b- b> c^ d^ e- e> f^
      a- g< g- c- d- h^ .. f-
      i- i> j^ .. .. h- .. l-
      m^ .. j- n< n- o^ .. lv
      m- p- p> q^ .. o- r- r>
      .. .. .. q- s- s> .. ..
    `,
  },
  {
    name: "Full House",
    map: `
      a- a> b^ .. c- c> d^ i-
      e^ .. b- g^ h^ .. d- iv
      e- j- j> g- h- k- k> ..
      l< l- m^ n- n> o^ p- p>
      .. .. m- q^ .. o- .. s-
      t- t> .. q- .. .. .. sv
    `,
  },
  {
    name: "Corner Store",
    map: `
      a^ b- b> c^ d- d> .. e- e>
      a- f^ g- c- h^ i- i> j^ ..
      .. f- gv .. h- .. m^ j- ..
      n- n> o- .. p- p> m- .. ..
      r- .. ov s- s> t^ .. u- u>
      rv v< v- .. .. t- .. w- w>
    `,
  },
  {
    name: "Garden Row",
    map: `
      e^ a- a> b^ c- c> d- f- f>
      e- g^ .. b- i^ .. dv j^ o-
      k^ g- l^ .. i- n^ .. j- ov
      k- .. l- r- r> n- .. s^ ..
      t^ u- u> v^ .. w- w> s- x-
      t- .. .. v- y- y> .. .. xv
    `,
  },
  {
    name: "Picnic Lot",
    map: `
      c< c- b^ a- a> d^ e- e> f^
      g^ .. b- .. i^ d- j- j> f-
      g- k^ l- l> i- m- m> n^ ..
      o- k- p^ q- q> .. .. n- r^
      ov s^ p- t< t- u^ v- v> r-
      .. s- x- x> .. u- z- z> ..
    `,
  },
  {
    name: "Weekend Market",
    map: `
      a< a- b^ c^ d- d> e^ f- f>
      g^ .. b- c- h< h- e- j^ k^
      g- l^ m- m> n^ o- o> j- k-
      p- l- q^ .. n- s- s> t^ u^
      pv v- q- w- w> x^ .. t- u-
      y- vv z^ A- A> x- B^ C- C>
      yv .. z- E- E> .. B- F- F>
    `,
  },
  {
    name: "Shady Corner",
    map: `
      a^ b^ c- c> d^ e- e> f^
      a- b- g< g- d- h^ .. f-
      i- i> j^ k- k> h- l- l>
      m^ .. j- n^ o- o> p^ q^
      m- r< r- n- s^ .. p- q-
      t- t> u^ .. s- v- v> w^
      y< y- u- z- z> .. .. w-
    `,
  },
  {
    name: "Lunch Break",
    map: `
      a< a- b^ c- c> d^ e^ f- f>
      g^ h^ b- i< i- d- e- j^ k^
      g- h- l- l> m^ n- n> j- k-
      o< o- p^ .. m- .. r^ s- s>
      t- u- p- v< v- w^ r- x- x>
      tv uv y^ z- z> w- A- A> B^
      C< C- y- D- D> E- E> .. B-
    `,
  },
  {
    name: "School Run",
    map: `
      a^ b- b> c- c> d- d> e^ ..
      a- f^ g< g- h^ i- i> e- j^
      k- f- l^ .. h- n^ o- o> j-
      kv .. l- p- p> n- r^ s^ ..
      t< t- u^ v- v> w^ r- s- x^
      y- y> u- z- z> w- A^ .. x-
      B< B- C- C> .. .. A- E- E>
    `,
  },
  {
    name: "Sunny Master",
    tip: "World 1 finale — follow each chain back to the car that can leave.",
    map: `
      a< a- b^ c- c> d- d> e^ f^
      g^ .. b- .. i^ j< j- e- f-
      g- k^ l- l> i- m^ n- n> o^
      p- k- q^ r- r> m- s^ .. o-
      pv t- q- u< u- v^ s- w- w>
      x- tv y^ z- z> v- A- A> B^
      xv .. y- D- D> E- E> .. B-
    `,
  },

  /* ================================================================
     WORLD 2 — CITY GARAGE: pillars, vans, fenced exits
     ================================================================ */
  {
    name: "Concrete Column",
    tip: "Pillars never move — no car can drive through one.",
    map: `
      a< a- b^ c^ d< d- e- e>
      f^ .. b- c- .. h< h- i^
      f- j< j- .. ## k- k> i-
      l^ m^ n- n> o- p- p- p>
      l- m- q< q- ov r^ s- s>
      t- t> .. u- u> r- v- v>
    `,
    types: "p:van",
  },
  {
    name: "Van Bay",
    tip: "Vans are long — they need a longer clear lane.",
    map: `
      a^ b< b- c^ d- d- d> e^
      a- .. ## c- g- g> .. e-
      h< h- i- j^ k- k> l^ m^
      n^ .. iv j- p- p> l- m-
      n- q< q- r< r- ## s- s>
      t- t- t> u- u> w- w- w>
    `,
  },
  {
    name: "Between Pillars",
    map: `
      a< a- b^ c- c> d- d> e^ f^
      g^ .. b- h< h- i^ m^ e- f-
      g- j< j- l- l> i- m- n- n>
      o^ p^ ## q^ r^ s^ ## t^ u^
      o- p- v- q- r- s- w- t- u-
      x< x- vv y- y- y> wv z- z>
    `,
  },
  {
    name: "Narrow Exit",
    tip: "Barriers close part of the road. Cars can only leave where it's open.",
    closed: "top:0-3",
    map: `
      a- a> b- b> c^ d- d> e^ f^
      g- h- i< i- c- j^ .. e- f-
      gv hv k- k- k> j- l^ m- m>
      n< n- o- o> p^ .. l- .. r^
      s- t- u< u- p- v^ w- w> r-
      sv tv x- x- x> v- y- y- y>
    `,
  },
  {
    name: "Deck Two",
    closed: "left:*",
    map: `
      a- a> b^ c^ d- d- d> e^ f^
      g^ h^ b- c- i- i> j^ e- f-
      g- h- k^ ## l- l> j- m- m>
      n^ o^ k- p- q- q> .. s- s>
      n- o- t^ pv u^ v^ ## w- w>
      x- x> t- y- u- v- z- A^ B^
      C- C> .. yv D- D> zv A- B-
    `,
  },
  {
    name: "Ramp Up",
    closed: "bottom:0-2",
    map: `
      a< a- b^ c^ d- d> e- e> f^
      g^ .. b- c- ## i^ j- j> f-
      g- k< k- l- l> i- m^ n^ o^
      p^ q^ r^ s< s- u^ m- n- o-
      p- q- r- v< v- u- w^ x- x>
      y^ z^ A^ .. ## .. w- C- C>
      y- z- A- D< D- E- E> F- F>
    `,
  },
  {
    name: "Service Lane",
    map: `
      a- a- a> b^ c- c> d^ e- e- e>
      f^ g< g- b- .. .. d- i^ j^ k^
      f- l< l- n< n- o- o> i- j- k-
      p< p- u^ ## r^ s^ ## t- t- t>
      v^ .. u- x- r- s- y- z- z> ..
      v- B< B- xv C- C> yv D^ E^ F^
      G- G- G> H- H> I- I> D- E- F-
    `,
  },
  {
    name: "Stairwell",
    map: `
      a< a- b^ c^ g^ d- d> e^ f^
      h^ ## b- c- g- i- i> e- f-
      h- j- k^ l- l> m^ n- n> o^
      p^ jv k- ## .. m- r- r> o-
      p- s< s- t- u- u> v^ w- w>
      x< x- y^ tv .. ## v- A- A>
      B< B- y- C< C- D- D> E- E>
    `,
  },
  {
    name: "Taxi Rank",
    map: `
      a- a> b- c- c> d- d> e^ f- f>
      g- h- bv i- i> j^ k^ e- l^ m^
      gv hv n- n> o- j- k- p^ l- m-
      q- q> r- r> ov s- s> p- t- t>
      u< u- v- w< w- x^ y< y- z^ A^
      B- .. vv D< D- x- E< E- z- A-
      Bv F< F- G< G- H< H- I< I- ..
    `,
  },
  {
    name: "Rooftop Deck",
    tip: "Only two roads are open up here. Work out which way each lane drains.",
    closed: "top:5-9 right:0-3 bottom:0-4 left:4-6",
    map: `
      a< a- b^ c< c- d< d- e- f< f-
      g^ h^ b- i< i- j- k- ev l- m-
      g- h- n^ o< o- jv kv p- lv mv
      q^ r^ n- s< s- t< t- pv u< u-
      q- r- v- v> w- w> x- x> y- z-
      A^ B- B> C^ D- D> E- E> yv zv
      A- F- F> C- G- G> H- H> I- I>
    `,
  },
  {
    name: "Pillar Grid",
    map: `
      a< a- b^ c- c> d^ e^ f- f>
      g^ h^ b- i< i- d- e- j^ k^
      g- h- ## l^ m^ n^ ## j- k-
      o< o- o- l- m- n- q- q> r^
      s< s- t- t> u^ v^ w- w> r-
      x^ y^ ## .. u- v- ## z^ A^
      x- y- B- B> C- C> .. z- A-
    `,
  },
  {
    name: "Loading Dock",
    map: `
      ## a- a> b- b> c- c> d^ e- e>
      f- g- g> h- i- i> j^ d- k^ l^
      fv m- ## hv n- n> j- o^ k- l-
      p- mv q- q> r- r> s^ o- t- t>
      pv u< u- v< v- w^ s- ## x^ y^
      z- A< A- B- C- w- D^ .. x- y-
      zv F< F- Bv Cv .. D- H< H- ##
    `,
  },
  {
    name: "Split Level",
    closed: "top:6-9 bottom:0-3",
    map: `
      a< a- a- b^ c< c- d< d- e- ##
      f^ g^ h^ b- i< i- j- .. ev k-
      f- g- h- l< l- m- jv n- o- kv
      p< p- q< q- ## mv r- nv ov s-
      t^ u- u> v- v> w- rv x- x> sv
      t- y^ z^ A- A> wv B- B- B> ..
      ## y- z- C- C- C> D- D> E- E>
    `,
  },
  {
    name: "Down the Ramp",
    map: `
      a- a> b^ c- c> d- d- d> e- e>
      f^ .. b- .. h^ i- j- k- l- l>
      f- m- m> n^ h- iv jv kv o- o>
      p^ q^ r^ n- s- s> t- u- v- w-
      p- q- r- x- x> y- tv uv vv wv
      z- z> A- A- A> yv C- C- C> ..
    `,
  },
  {
    name: "Pillar Maze",
    map: `
      a< a- b^ c^ d- d- d> f^ g- g>
      h^ i^ b- c- ## j- j> f- k^ l^
      h- i- m< m- n- n> o^ .. k- l-
      q- ## r^ s^ .. t^ o- ## u^ v^
      qv w- r- s- .. t- y- y> u- v-
      z- wv A^ B^ ## C^ D^ E- ## F^
      zv .. A- B- .. C- D- Ev .. F-
    `,
  },
  {
    name: "Tight Corners",
    map: `
      ## a- a> b- b- b> c^ d- d> e^
      f- g- h- i- i> j- c- k^ l^ e-
      fv gv hv m- m> jv .. k- l- o^
      p< p- q< q- r< r- ## s^ t^ o-
      u- v< v- w< w- x< x- s- t- y^
      uv z< z- A- B< B- C< C- D^ y-
      E< E- E- Av F< F- G< G- D- ##
    `,
  },
  {
    name: "Rush Hour",
    closed: "top:6-9 right:0-2 bottom:0-5 left:3-6",
    map: `
      a< a- b^ c< c- c- d< d- e- f-
      g^ h^ b- i< i- j^ k- l- ev fv
      g- h- m< m- n^ j- kv lv o< o-
      p^ q- q> r^ n- s- s> t- u- v-
      p- w- w> r- x^ y- y> tv uv vv
      z^ A^ B- B> x- C^ D- D- D> E-
      z- A- F- F- F> C- G- G- G> Ev
    `,
  },
  {
    name: "Security Gate",
    closed: "top:0-4 left:0-3 right:4-6 bottom:5-8",
    map: `
      ## a- a> b- c- c> d^ e- e>
      f- g- g> bv h- i^ d- j^ k^
      fv l- l> m- hv i- o^ j- k-
      p- q- q> mv r- r> o- s- s>
      pv t< t- u< u- v^ w< w- x^
      y- z< z- A- .. v- C^ D^ x-
      yv E< E- Av F< F- C- D- ##
    `,
  },
  {
    name: "Evening Rush",
    closed: "left:*",
    map: `
      a^ b^ c^ d^ ## e- e> f- f- f>
      a- b- c- d- g- g> h- i- j- k-
      l- l> m^ n^ o- o> hv iv jv kv
      ## .. m- n- q- q> r- s- t- u-
      v- v> w^ x^ y- y> rv sv tv uv
      z- z> w- x- A- A> B- B- B> C-
      D- D- D> E- E> F- F> G- G> Cv
    `,
  },
  {
    name: "Garage Master",
    tip: "World 2 finale — two lanes drain into the others. Find where each one ends.",
    closed: "top:6-9 right:0-2 bottom:0-5 left:3-6",
    map: `
      a< a- b^ c^ d< d- e< e- f- ##
      g< g- b- c- h^ i< i- j- fv l-
      m^ n< n- o^ h- ## p- jv q- lv
      m- r- r> o- s- s> pv t- qv u-
      v^ w^ x- x> y- y> z- tv A- uv
      v- w- B^ C- C- C> zv D- Av E-
      ## .. B- G- G> H- H> Dv .. Ev
    `,
  },

  /* ================================================================
     WORLD 3 — SHOPPING CENTER: buses, planters, barriers, bigger lots
     ================================================================ */
  {
    name: "Mall Entrance",
    tip: "Buses take four spaces — they need a long clear lane.",
    types: "F:bus",
    map: `
      a< a- b^ c< c- d- d> e^ f- f>
      g< g- b- h^ i^ j^ k^ e- m^ l^
      n^ o< o- h- i- j- k- p^ m- l-
      n- q< q- u^ %% %% s- p- t- t>
      v< v- w- u- %% %% sv x- x> y-
      z- .. wv B< B- C- C> D- E- yv
      zv F< F- F- F- G- G> Dv Ev ..
    `,
  },
  {
    name: "Shopping Carts",
    types: "a:bus",
    map: `
      == a- a- a- a> b- c- c> d^ e^
      f- g- g> h- i- bv j^ k^ d- e-
      fv l- l> hv iv m- j- k- n- n>
      o< o- p< p- q- mv r^ s^ t^ u^
      v- w< w- x- qv y- r- s- t- u-
      vv z< z- xv A- yv B< B- C< C-
      E< E- F< F- Av G< G- H< H- %%
    `,
  },
  {
    name: "Crosswalk",
    types: "c:bus H:bus",
    closed: "top:6-10 right:0-3 bottom:0-5 left:4-6",
    map: `
      a< a- b^ c< c- c- c- d< d- e- %%
      f^ g^ b- h< h- i^ j- k< k- ev l-
      f- g- m< m- n^ i- jv o- p- q- lv
      r< r- s< s- n- == t- ov pv qv u-
      v^ w- w> x^ y- y> tv z- z> A- uv
      v- B^ C^ x- D- D> E- E> F- Av G-
      %% B- C- H- H- H- H> .. Fv .. Gv
    `,
  },
  {
    name: "Food Court",
    map: `
      a< a- b< b- c^ d^ e- e> f- f>
      g^ h^ i< i- c- d- k- k> j^ l^
      g- h- m^ n< n- o- o> p^ j- l-
      q< q- m- r^ %% %% s^ p- t- t>
      u< u- v- r- %% %% s- w- w> x-
      y- .. vv A< A- B- B> C- D- xv
      yv E< E- F- G< G- H- Cv Dv I-
      J< J- J- Fv K< K- Hv L- L> Iv
    `,
  },
  {
    name: "Bus Stop",
    types: "c:bus I:bus H:van",
    closed: "top:0-5 left:0-2 right:3-6 bottom:6-10",
    map: `
      %% a- a> b- c- c- c- c> d^ e- e>
      f- g- g> bv h- i- i> j^ d- k^ l^
      fv m- m> n- hv o- o> j- p^ k- l-
      q< q- r- nv s< s- t^ u^ p- v^ w^
      x- .. rv z< z- A- t- u- B^ v- w-
      xv C< C- D- E- Av F< F- B- G< G-
      H< H- H- Dv Ev I< I- I- I- .. ==
    `,
  },
  {
    name: "Garden Plaza",
    types: "I:bus L:bus u:van e:van",
    closed: "top:0-3 left:0-4 right:5-7 bottom:4-10",
    map: `
      %% a- a> b- c- c> d^ e- e- e> f^
      g- h- h> bv i^ j^ d- k^ l^ m^ f-
      gv n- %% o- i- j- p^ k- l- m- q^
      r- nv s- ov t- t> p- u- u- u> q-
      rv v- sv w- w> x^ y- y> z^ A- A>
      B- vv C- D- E^ x- F< F- z- G< G-
      Bv .. Cv Dv E- I< I- I- I- J< J-
      L< L- L- L- M< M- N< N- O< O- %%
    `,
  },
  {
    name: "Parcel Pickup",
    types: "D:van L:van",
    closed: "top:7-9 right:0-2 bottom:0-6 left:3-7",
    map: `
      a< a- b^ c< c- d^ e< e- f- ==
      g^ h^ b- i^ j^ d- k^ l- fv m-
      g- h- n^ i- j- o^ k- lv .. mv
      q^ r^ n- s- s> o- t^ u- v- w-
      q- r- x- x> y^ .. t- uv vv wv
      A^ B- B> C^ y- D- D- D> E- F-
      A- G^ H^ C- I- I> J^ K- Ev Fv
      == G- H- L- L- L> J- Kv M- M>
    `,
  },
  {
    name: "Valet Stand",
    types: "H:bus c:van o:van",
    closed: "bottom:* left:0-3 right:4-7",
    map: `
      a- a> b^ c- c- c> d^ e- e> f^ g^
      h^ i^ b- j- j> k^ d- l- l> f- g-
      h- i- m- m> n^ k- o- o- o> p^ q^
      r- r> s^ t^ n- u^ v- v> w^ p- q-
      x< x- s- t- y^ u- z^ A^ w- B^ C^
      D< D- E< E- y- F^ z- A- G^ B- C-
      H< H- H- H- .. F- J< J- G- K^ L^
      M< M- N< N- %% .. .. .. == K- L-
    `,
  },
  {
    name: "Loading Bay",
    types: "N:bus F:van",
    closed: "top:6-10 right:0-3 bottom:0-5 left:4-7",
    map: `
      a< a- b< b- c^ d< d- e< e- f- ==
      g^ h^ i< i- c- j^ k- l- m- fv n-
      g- h- o^ p< p- j- kv lv mv q- nv
      r< r- o- s< s- == t- u- v- qv w-
      x^ y- y> z^ A- A> tv uv vv B- wv
      x- C^ D^ z- E- E> F- F- F> Bv G-
      .. C- D- I- I> J- J> K- L- M- Gv
      %% N- N- N- N> O- O> Kv Lv Mv ..
    `,
  },
  {
    name: "Grand Opening",
    types: "P:van",
    closed: "top:0-6 left:0-2 right:3-7 bottom:7-10",
    map: `
      %% a- a> b- b> c- c> d^ e- e> f^
      g- h- i- i> j- k- k> d- l^ m^ f-
      gv hv n- %% jv o- o> p^ l- m- q^
      r< r- nv s- t< t- u- p- v< v- q-
      w- x< x- sv y< y- uv z^ A^ B^ C^
      wv D- E< E- F- G< G- z- A- B- C-
      H- Dv I- J- Fv K< K- L^ M^ N< N-
      Hv .. Iv Jv P< P- P- L- M- .. %%
    `,
  },
  {
    name: "Cart Return",
    types: "o:bus H:van",
    closed: "right:* top:0-5 bottom:6-10",
    map: `
      a< a- b< b- c- %% d^ e^ f^ g^ h^
      i- j- k< k- cv l- d- e- f- g- h-
      iv jv m- n< n- lv o< o- o- o- p^
      q< q- mv r- s< s- t^ u< u- v^ p-
      w- x< x- rv y- z- t- A< A- v- B^
      wv C< C- D- yv zv E^ F^ G< G- B-
      H< H- H- Dv I< I- E- F- J< J- %%
    `,
  },
  {
    name: "Sale Day",
    types: "c:bus H:bus M:van",
    closed: "top:8-10 right:0-4 bottom:0-7 left:5-7",
    map: `
      a< a- b^ c< c- c- c- d^ e< e- ==
      f^ g^ b- h^ i^ j^ k^ d- l- m- n-
      f- g- o^ h- i- j- k- p^ lv mv nv
      q< q- o- r< r- s< s- p- t< t- u-
      v^ w^ x^ y^ == z^ A^ B^ C- D- uv
      v- w- x- y- .. z- A- B- Cv Dv F-
      G- G> H- H- H- H> I^ J^ K- L- Fv
      %% M- M- M> N- N> I- J- Kv Lv ..
    `,
  },
  {
    name: "Checkout Lane",
    types: "d:van J:van K:van",
    closed: "left:*",
    map: `
      a^ b- b> c^ d- d- d> e^ f- f>
      a- g^ h^ c- i^ j^ k^ e- l^ m^
      .. g- h- o^ i- j- k- p^ l- m-
      %% q^ r^ o- s^ %% t^ p- u- u>
      %% q- r- v- s- w- t- x- x> y-
      z- A- A> vv B- wv C- C> D- yv
      zv E- E> F- Bv G- G> H- Dv I-
      J- J- J> Fv K- K- K> Hv .. Iv
    `,
  },
  {
    name: "Delivery Door",
    types: "c:bus P:bus",
    closed: "top:0-5 left:0-3 right:4-7 bottom:6-10",
    map: `
      %% a- a> b- c- c- c- c> d^ e- e>
      f- == g- bv h- i- i> j^ d- k^ l^
      fv m- gv n- hv o- o> j- p^ k- l-
      q- mv r- nv s- t- t> u^ p- v- v>
      qv w- rv x- sv y- z^ u- A^ B^ C^
      D- wv E- xv F- yv z- G^ A- B- C-
      Dv H- Ev I- Fv J< J- G- M^ K< K-
      .. Hv .. Iv P< P- P- P- M- .. %%
    `,
  },
  {
    name: "Coffee Stop",
    types: "E:van N:bus",
    closed: "top:5-10 right:0-3 bottom:0-4 left:4-7",
    map: `
      a< a- b^ c^ d< d- e< e- f- g- ==
      h< h- b- c- i^ j< j- k- fv gv l-
      m^ n^ o< o- i- p- q- kv r< r- lv
      m- n- s^ t< t- pv qv u< u- v- w-
      x^ y^ s- z^ == A- A> B- C- vv wv
      x- y- D^ z- E- E- E> Bv Cv G- H-
      I- I> D- J- J> K- K> L- M- Gv Hv
      %% N- N- N- N> O- O> Lv Mv P- P>
    `,
  },
  {
    name: "Flower Market",
    types: "c:bus E:van",
    closed: "top:6-10 right:0-3 bottom:0-5 left:4-7",
    map: `
      a< a- b^ c< c- c- c- d< d- f- ==
      g^ h^ b- i^ j< j- k- l- %% fv m-
      g- h- n^ i- o^ .. kv lv q- r- mv
      s< s- n- t^ o- == u- v- qv rv w-
      x^ y- y> t- z- z> uv vv A- B- wv
      x- C^ D^ E- E- E> F- F> Av Bv G-
      .. C- D- I^ J- J> K- L- M- N- Gv
      %% O- O> I- P- P> Kv Lv Mv Nv ..
    `,

  },
  {
    name: "Evening Sale",
    types: "a:van b:bus M:bus",
    closed: "top:0-7 left:0-2 right:3-7 bottom:8-10",
    map: `
      %% a- a- a> b- b- b- b> c^ d- d>
      e- f- g- g> h- h> i- i> c- j^ k^
      ev fv l- m- == n- o- p- q^ j- k-
      r< r- lv mv s- nv ov pv q- t< t-
      u- v< v- w- sv x< x- y< y- z^ A^
      uv B- C- wv D< D- E< E- F^ z- A-
      G- Bv Cv H- I< I- J< J- F- K< K-
      Gv L< L- Hv M< M- M- M- N< N- %%
    `,
  },
  {
    name: "Parking Permit",
    types: "c:van G:van",
    closed: "top:4-9 right:0-4 bottom:0-3 left:5-7",
    map: `
      a< a- b^ c< c- c- d< d- e- ==
      f^ g^ b- h^ i- j< j- k- ev l-
      f- g- m^ h- iv n- o- kv p- lv
      q< q- m- r^ s- nv ov t- pv u-
      v< v- w^ r- sv x< x- tv y- uv
      z^ A^ w- B- B> C- C> D- yv E-
      z- A- F- F> G- G- G> Dv H- Ev
      == I- I> J- J> K- K> .. Hv ..
    `,
  },
  {
    name: "Rainy Weekend",
    types: "e:van u:van J:bus M:bus",
    closed: "top:0-5 left:0-3 right:4-7 bottom:6-10",
    map: `
      %% a- a> b- c- c> d^ e- e- e> f^
      g- %% h- bv i- j- d- k^ l^ m^ f-
      gv n- hv o- iv jv p^ k- l- m- q^
      r- nv s- ov t- t> p- u- u- u> q-
      rv v- sv w- x< x- y^ z^ A^ B^ C^
      D- vv E- wv F< F- y- z- A- B- C-
      Dv G- Ev H- I< I- J< J- J- J- ..
      .. Gv .. Hv M< M- M- M- N< N- %%
    `,
  },
  {
    name: "Black Friday",
    tip: "World 3 finale — the whole mall is jammed. Start where the roads are open.",
    types: "d:van",
    closed: "left:* top:7-10 bottom:0-6",
    map: `
      a^ b- b> c^ d- d- d> e- g- f- f>
      a- h^ i^ c- j^ k^ n^ ev gv l- m-
      .. h- i- p^ j- k- n- q- q> lv mv
      %% r- r> p- s- s> t^ u- v- w- w>
      %% x^ y^ z- z> A^ t- uv vv B- C-
      .. x- y- E- E> A- F- F> G- Bv Cv
      H- H> I^ J- J> K^ L^ M- Gv N- O-
      %% .. I- Q- Q> K- L- Mv .. Nv Ov
    `,

  },

  /* ================================================================
     WORLD 4 — AIRPORT PARKING: shuttles, bollards, restricted lanes
     ================================================================ */
  {
    name: "Terminal Drop-off",
    tip: "Shuttles are long. Bollards block lanes just like pillars do.",
    types: "H:shuttle I:shuttle u:van e:van",
    closed: "top:0-5 left:0-2 right:3-6 bottom:6-10",
    map: `
      ** a- a> b- c- c> d^ e- e- e> f^
      g- h- h> bv i- j- d- k^ l^ m^ f-
      gv n- n> o- iv jv p^ k- l- m- q^
      r< r- s- ov t< t- p- u< u- u- q-
      v- w- sv x< x- y- z^ A^ B^ C< C-
      vv wv D< D- E- yv z- A- B- F< F-
      H< H- H- H- Ev I< I- I- I- .. **
    `,
  },
  {
    name: "Baggage Claim",
    types: "d:shuttle G:shuttle L:van",
    closed: "top:7-11 right:0-3 bottom:0-6 left:4-6",
    map: `
      a< a- b^ c< c- d< d- d- d- e< e- **
      f^ g^ b- h^ i^ j< j- k- l- m- n- o-
      f- g- p^ h- i- q^ .. kv lv mv nv ov
      s< s- p- t< t- q- ** u- v- w- x- y-
      z^ A- A> B^ C- C> .. uv vv wv xv yv
      z- E^ F^ B- G- G- G- G> H- I- J- K-
      ** E- F- L- L- L> M- M> Hv Iv Jv Kv
    `,
  },
  {
    name: "Short Stay",
    types: "c:van e:shuttle v:van J:shuttle",
    closed: "bottom:* left:0-3 right:4-7",
    map: `
      a- a> b^ c- c- c> d^ e- e- e- e> f^
      g^ h^ b- i^ j- j> d- k^ l- l> m^ f-
      g- h- n^ i- o^ p^ q^ k- r- r> m- s^
      t- t> n- u^ o- p- q- w^ v- v- v> s-
      x< x- y^ u- z< z- A^ w- B^ C^ D^ E^
      F< F- y- G< G- H^ A- I^ B- C- D- E-
      J< J- J- J- K^ H- L^ I- M< M- N^ O^
      P< P- Q< Q- K- ** L- .. .. .. N- O-
    `,
  },
  {
    name: "Long Term",
    types: "e:van x:van N:shuttle",
    closed: "top:0-6 left:0-3 right:4-7 bottom:7-11",
    map: `
      ** a- a> b- b> c- c> d^ e- e- e> f^
      g- h- h> i- j- k- k> d- l^ m^ n^ f-
      gv ** o- iv jv p- p> q^ l- m- n- r^
      s- t- ov u- v- v> w- q- x- x- x> r-
      sv tv y- uv z< z- wv A^ B^ C^ D^ E^
      F< F- yv G< G- H- I- A- B- C- D- E-
      J- K< K- L- M- Hv Iv N< N- N- N- ..
      Jv P< P- Lv Mv Q< Q- R< R- S< S- **
    `,
  },
  {
    name: "Car Hire",
    types: "L:van M:shuttle",
    closed: "top:5-10 right:0-2 bottom:0-4 left:3-7",
    map: `
      a< a- b^ c^ d< d- e< e- f- g- **
      h^ i^ b- c- j^ k< k- l- fv gv m-
      h- i- n< n- j- o- p- lv q< q- mv
      r^ s^ t^ u^ ** ov pv v- w- x- y-
      r- s- t- u- z- z> A- vv wv xv yv
      B^ C- C> D^ E- E> Av F- G- H- I-
      B- J^ K^ D- L- L- L> Fv Gv Hv Iv
      ** J- K- M- M- M- M> N- N> O- O>
    `,
  },
  {
    name: "Runway View",
    types: "p:shuttle S:shuttle",
    closed: "right:* top:0-5 bottom:6-11",
    map: `
      a< a- b< b- c- ** d^ e^ f^ g^ h^ i^
      j- k- l< l- cv m- d- e- f- g- h- i-
      jv kv n- o< o- mv p< p- p- p- q< q-
      r< r- nv s- t< t- u^ v< v- w^ x^ y^
      z- A< A- sv B- C- u- D< D- w- x- y-
      zv E- F< F- Bv Cv G^ H^ I< I- J^ K^
      .. Ev M- N< N- O- G- H- P< P- J- K-
      Q< Q- Mv R< R- Ov S< S- S- S- .. **
    `,
  },
  {
    name: "Gate 12",
    types: "P:van Q:shuttle S:shuttle",
    closed: "top:8-11 right:0-4 bottom:0-7 left:5-7",
    map: `
      a< a- b^ c< c- d^ e< e- f- g- h- **
      i^ j^ b- k^ l^ d- m^ n^ fv gv hv o-
      i- j- p^ k- l- q^ m- n- r< r- s- ov
      t< t- p- u< u- q- v< v- w- x- sv y-
      z^ A< A- B^ C< C- D< D- wv xv .. yv
      z- F^ G^ B- H- H> I^ J^ K- L- M- N-
      .. F- G- P- P- P> I- J- Kv Lv Mv Nv
      ** Q- Q- Q- Q> R- R> S- S- S- S> ..
    `,
  },
  {
    name: "Rental Return",
    closed: "top:0-4 left:0-3 right:4-7 bottom:5-10",
    map: `
      ** a- a> b- c- c> d^ e- e> f^ g^
      h- i- i> bv j- k^ d- l^ m^ f- g-
      hv n- n> o- jv k- p^ l- m- r^ q^
      s- t- t> ov u- u> p- v- v> r- q-
      sv w< w- x- y< y- z^ A^ B^ C^ D^
      E< E- F- xv G< G- z- A- B- C- D-
      H- I- Fv J- K< K- L^ M^ N^ O< O-
      Hv Iv .. Jv .. ** L- M- N- .. ..
    `,
  },
  {
    name: "Holding Pattern",
    tip: "Everything below drives up into the jam above.",
    types: "e:shuttle u:shuttle L:van Q:shuttle",
    closed: "bottom:* right:0-3 left:4-7",
    map: `
      a< a- b^ c< c- d^ e< e- e- e- f^ **
      g^ h^ b- i^ j^ d- k^ l^ m^ n^ f- ..
      g- h- p^ i- j- q^ k- l- m- n- r< r-
      s< s- p- t< t- q- u< u- u- u- v< v-
      w^ x^ y^ z^ A^ ** B- B> C^ D^ E- E>
      w- x- y- z- A- F- F> G^ C- D- H- H>
      I- I> J^ K^ L- L- L> G- M^ N^ O- O>
      ** .. J- K- Q- Q- Q- Q> M- N- R- R>
    `,

  },
  {
    name: "Departures",
    types: "c:shuttle e:van v:van O:van P:van",
    closed: "top:0-5 left:0-3 right:4-7 bottom:6-11",
    map: `
      ** a- a> b- c- c- c- c> d^ e- e- e>
      f- ** g- bv h- i- j^ k^ d- l^ m^ n^
      fv o- gv p- hv iv j- k- q^ l- m- n-
      r- ov s- pv t- t> u- u> q- v- v- v>
      rv w- sv x< x- y- z^ A^ B< B- C^ D^
      E- wv F< F- G- yv z- A- H^ I^ C- D-
      Ev J< J- K- Gv L< L- M^ H- I- ** ..
      O< O- O- Kv P< P- P- M- Q< Q- .. **
    `,
  },
  {
    name: "Arrivals Hall",
    types: "c:van e:van G:van R:shuttle",
    closed: "top:6-11 right:0-3 bottom:0-5 left:4-7",
    map: `
      a< a- b^ c< c- c- d< d- e< e- e- **
      g^ h^ b- i^ j^ k^ l- m- n- o- ** p-
      g- h- q^ i- j- k- lv mv nv ov r- pv
      s< s- q- t< t- u< u- v< v- w- rv x-
      y^ z- z> A^ B- B> C- C> D- wv E- xv
      y- F- F> A- G- G- G> H- Dv I- Ev J-
      .. ** L- L> M- M> N- Hv O- Iv P- Jv
      ** R- R- R- R> .. Nv .. Ov .. Pv ..
    `,
  },
  {
    name: "Security Check",
    tip: "The centre lanes are closed. Cars there must cross sideways.",
    types: "d:van O:van",
    closed: "top:4-6 bottom:4-6",
    map: `
      a< a- b^ c< c- d- d- d> f^ g- g>
      h^ i^ b- j^ k< k- l- l> f- m^ n^
      h- i- o^ j- p< p- q- q> r^ m- n-
      s< s- o- t< t- ** u- u> r- v- v>
      w< w- x- y< y- ** z- z> A- B- B>
      C- D- xv E- F< F- G- G> Av H- I-
      Cv Dv J- Ev K< K- L- L> M- Hv Iv
      N< N- Jv O< O- O- P- P> Mv .. ..
    `,
  },
  {
    name: "Parking Shuttle",
    types: "a:shuttle e:van o:van u:van H:shuttle K:shuttle O:van",
    closed: "top:0-7 left:0-2 right:3-7 bottom:8-11",
    map: `
      ** a- a- a- a> b- c- c> d^ e- e- e>
      f- g- g> h- i- bv j- j> d- k^ l^ m^
      fv n- n> hv iv o- o- o> p^ k- l- m-
      q< q- r< r- s< s- t< t- p- u< u- u-
      v- w- x< x- y- z- A< A- B^ C^ D^ E^
      vv wv F< F- yv zv G< G- B- C- D- E-
      H< H- H- H- I- J< J- K< K- K- K- ..
      M< M- N< N- Iv O< O- O- P< P- .. **
    `,
  },
  {
    name: "Frequent Flyer",
    types: "Q:shuttle",
    closed: "left:* top:5-10 bottom:0-4",
    map: `
      a^ b- b> c^ d- d> e- f- g- h- h>
      a- i^ j^ c- k^ l- ev fv gv m- n-
      .. i- j- p^ k- lv q- q> r- mv nv
      ** s- s> p- t^ u- u> v- rv w- w>
      x- x> y^ z^ t- A- B- vv C- D- E-
      F- F> y- z- G^ Av Bv H- Cv Dv Ev
      I- I> J^ K^ G- L- L> Hv M- N- O-
      ** .. J- K- Q- Q- Q- Q> Mv Nv Ov
    `,
  },
  {
    name: "Lost & Found",
    types: "N:van R:shuttle",
    closed: "top:4-11 right:0-4 bottom:0-3 left:5-7",
    map: `
      a< a- b^ c^ d< d- e< e- f< f- g- **
      h^ i^ b- c- j- k- l- m- n- o- gv p-
      h- i- q^ ** jv kv lv mv nv ov r- pv
      s< s- q- t< t- u< u- v< v- w- rv x-
      y^ z< z- A< A- B- C< C- D- wv E- xv
      y- F^ G- G> H- Bv I- I> Dv J- Ev K-
      .. F- M- M> Hv N- N- N> O- Jv P- Kv
      ** Q- Q> R- R- R- R> .. Ov .. Pv ..
    `,
  },
  {
    name: "Crew Parking",
    types: "e:van w:van P:van Q:shuttle",
    closed: "top:0-4 left:0-4 right:5-7 bottom:5-11",
    map: `
      ** a- a> b- b> c- c> d^ e- e- e> f^
      g- h- i- j- j> k^ l^ d- m^ n^ o^ f-
      gv hv iv p- p> k- l- q^ m- n- o- r^
      s- t- t> u- u> v- v> q- w- w- w> r-
      sv x- y- z- ** A^ B^ C^ D^ E^ F^ G^
      H- xv yv zv I- A- B- C- D- E- F- G-
      Hv J< J- K- Iv L< L- M< M- N< N- ..
      P< P- P- Kv Q< Q- Q- Q- R< R- .. **
    `,
  },
  {
    name: "Duty Free",
    types: "a:shuttle A:shuttle P:shuttle K:van",
    closed: "top:8-11 right:0-3 bottom:0-7 left:4-7",
    map: `
      a< a- a- a- b^ c< c- d^ e< e- f- **
      g^ h^ i^ j^ b- k^ l^ d- m- n- fv o-
      g- h- i- j- p^ k- l- q^ mv nv r- ov
      s< s- t< t- p- u< u- q- v< v- rv w-
      x^ y- y> z^ A- A- A- A> B- C- D- wv
      x- E^ F^ z- G- G> H^ I^ Bv Cv Dv J-
      .. E- F- K- K- K> H- I- M- N- O- Jv
      ** P- P- P- P> Q- Q> .. Mv Nv Ov ..
    `,
  },
  {
    name: "Red-Eye",
    types: "e:shuttle u:shuttle",
    closed: "right:*",
    map: `
      a< a- b^ c< c- d^ e< e- e- e- f^ g^
      h^ i^ b- j^ o^ d- k^ l^ m^ n^ f- g-
      h- i- p^ j- o- q^ k- l- m- n- r< r-
      s< s- p- t< t- q- u< u- u- u- .. **
      w- x- y< y- z- A- B< B- C- D- .. **
      wv xv E< E- zv Av F< F- Cv Dv G- H-
      I< I- J- K< K- L- M< M- N- O- Gv Hv
      P< P- Jv Q< Q- Lv R< R- Nv Ov S< S-
    `,
  },
  {
    name: "Last Call",
    types: "a:shuttle e:van w:van L:shuttle M:shuttle",
    closed: "top:0-6 left:0-3 right:4-7 bottom:7-11",
    map: `
      ** a- a- a- a> b- c- c> d^ e- e- e>
      f- g- g> h- i- bv j- j> d- k^ l^ m^
      fv n- n> hv iv o- o> p^ q^ k- l- m-
      r- s- ** t- u- u> v- p- q- w- w- w>
      rv sv x- tv y< y- vv z^ A^ B^ C^ D^
      E< E- xv F- G< G- H- z- A- B- C- D-
      I- J< J- Fv K< K- Hv L< L- L- L- ..
      Iv M< M- M- M- N< N- O< O- P< P- **
    `,
  },
  {
    name: "Airport Master",
    tip: "World 4 finale — up top everything drains left, below it drains right.",
    types: "a:taxi k:taxi p:taxi B:taxi I:taxi M:taxi P:shuttle R:shuttle Q:van",
    closed: "top:* right:0-3 left:4-7",
    map: `
      a< a- b< b- c- d- ** e- f- g- h- **
      i- j- k< k- cv dv l- ev fv gv hv m-
      iv jv n< n- o< o- lv p< p- q< q- mv
      r< r- s- t< t- u- v< v- w- x< x- y-
      z- A- sv B- B> uv C- C> wv D- D> yv
      zv Av E- E> F- G- G> H- I- I> J- ..
      K- K> L- L> Fv M- M> Hv N- N> Jv O-
      P- P- P- P> Q- Q- Q> R- R- R- R> Ov
    `,

  },

  /* ================================================================
     WORLD 5 — NIGHT DOWNTOWN: everything combined
     ================================================================ */
  {
    name: "Neon Alley",
    tip: "Night falls downtown. Headlights still show which way each car faces.",
    closed: "top:0-5 left:0-2 right:3-6 bottom:6-10",
    map: `
      ## a- a> b- c- c> d^ e- e> f^ g^
      h- i- i> bv j- k- d- l^ m^ f- g-
      hv n- n> o- jv kv p^ l- m- q- q>
      r< r- s- ov t< t- p- u< u- v^ w^
      x- y- sv z< z- A- B^ C^ D^ v- w-
      xv yv E< E- F- Av B- C- D- G< G-
      H< H- I< I- Fv J< J- K< K- .. %%
    `,
  },
  {
    name: "Late Show",
    types: "t:van Q:bus S:van",
    closed: "top:* left:0-3 right:4-7",
    map: `
      ## a- a> b- c- c> d- e- e> f- g- g>
      h- h> i- bv j- k- dv l- m- fv n- n>
      o- o> iv p- jv kv q- lv mv r- s- s>
      t- t- t> pv u- u> qv v- v> rv w- w>
      x< x- y- z< z- A- B< B- C- D< D- ##
      E- F- yv G< G- Av H< H- Cv I- J- K-
      Ev Fv L< L- M- N< N- O- P- Iv Jv Kv
      Q< Q- Q- Q- Mv R< R- Ov Pv S< S- S-
    `,
  },
  {
    name: "Jazz Club",
    types: "c:van w:van",
    closed: "left:* top:0-5 bottom:6-11",
    map: `
      ## a- a> b- c- c- c> d^ e- e> f^ g^
      h- h> i- bv j- k- l^ d- m^ n^ f- g-
      o- o> iv p- jv kv l- q^ m- n- r- r>
      s- s> t- pv u- u> v^ q- w- w- w> ..
      ## x- tv y- z- A- v- B- B> C^ D^ E^
      F- xv G- yv zv Av H- H> I^ C- D- E-
      Fv J- Gv K- L- L> M^ N^ I- O^ P^ Q^
      .. Jv .. Kv T- T> M- N- .. O- P- Q-
    `,
  },
  {
    name: "Rooftop Bar",
    types: "c:van Q:bus R:van",
    closed: "top:6-11 right:0-3 bottom:0-5 left:4-7",
    map: `
      a< a- b^ c< c- c- d< d- e< e- f- ##
      g^ h^ b- i^ j^ k^ l< l- m- n- fv o-
      g- h- p^ i- j- k- q< q- mv nv r- ov
      s< s- p- t< t- ## .. v- w- x- rv y-
      z^ A^ B^ C^ D^ .. ## vv wv xv E- yv
      z- A- B- C- D- F- F> G- H- I- Ev J-
      K- K> L^ M- M> N- N> Gv Hv Iv O- Jv
      ## .. L- Q- Q- Q- Q> R- R- R> Ov ..
    `,
  },
  {
    name: "Midnight Deli",
    types: "e:van u:van P:bus",
    closed: "bottom:* left:0-3 right:4-7",
    map: `
      ## a- a> b^ c- c> d^ e- e- e> f^
      g- g> h^ b- i^ j^ d- k^ l^ m^ f-
      n- n> h- o^ i- j- p^ k- l- m- q^
      r- r> s^ o- t- t> p- u- u- u> q-
      v< v- s- w^ x< x- y^ z^ A^ B^ C^
      D< D- E^ w- F^ G^ y- z- A- B- C-
      H< H- E- I^ F- G- J< J- K^ L< L-
      N< N- .. I- P< P- P- P- K- .. ==
    `,
  },
  {
    name: "Taxi Stand",
    types: "c:taxi k:taxi q:taxi z:taxi G:taxi K:taxi u:van w:van N:van O:van P:bus",
    closed: "top:* right:0-3 left:4-7",
    map: `
      a< a- b- c< c- d- e< e- f- g< g- ##
      h< h- bv i- j- dv k< k- fv l- m- n-
      o< o- p- iv jv q< q- r- s- lv mv nv
      t< t- pv u< u- u- v- rv sv w< w- w-
      ## x- x> y- z- z> vv A- A> B- C- C>
      D- E- E> yv F- G- G> H- I- Bv J- J>
      Dv K- K> L- Fv M- M> Hv Iv N- N- N>
      O- O- O> Lv P- P- P- P> Q- Q> .. ..
    `,
  },
  {
    name: "After Hours",
    types: "y:van",
    closed: "right:* top:6-11 bottom:0-5",
    map: `
      a^ b^ c< c- d^ e^ f< f- g- h< h- ##
      a- b- i^ j^ d- e- k- l- gv m- n- ..
      p< p- i- j- q< q- kv lv r- mv nv ..
      s^ t< t- u^ v^ w^ x< x- rv y< y- y-
      s- z^ A^ u- v- w- B- C- D- E- F- ##
      G^ z- A- H< H- I^ Bv Cv Dv Ev Fv J-
      G- K< K- L^ M^ I- N- O- P< P- Q- Jv
      R< R- .. L- M- ## Nv Ov .. .. Qv ..
    `,
  },
  {
    name: "Valet Night",
    types: "Q:van R:van",
    closed: "top:0-5 left:0-3 right:4-7 bottom:6-11",
    map: `
      ## a- a> b- b> c- d^ e- e> f^ g- g>
      h- ## i- i> j- cv d- k^ l^ f- m^ n^
      hv o- ## p- jv q- q> k- l- r^ m- n-
      s- ov t- pv u- u> v- v> w^ r- x- x>
      sv y- tv z< z- A- B^ C^ w- .. E^ F^
      G- yv H< H- I- Av B- C- J^ ## E- F-
      Gv K< K- L- Iv M< M- N^ J- .. ## ..
      Q< Q- Q- Lv R< R- R- N- S< S- .. ##
    `,
  },
  {
    name: "Club Queue",
    types: "D:van J:van",
    closed: "bottom:* right:0-3 left:4-7",
    map: `
      a< a- b^ c< c- d^ e< e- f^ g< g- ##
      h^ i^ b- j^ k^ d- l^ m^ f- n^ o^ ..
      h- i- p^ j- k- q^ l- m- r^ n- o- ..
      t< t- p- u< u- q- v< v- r- w< w- ##
      ## x^ y^ z- z> A^ B- B> C^ D- D- D>
      .. x- y- F^ G^ A- H^ I^ C- J- J- J>
      K- K> L^ F- G- M^ H- I- N^ P^ O- O>
      ## .. L- R- R> M- S- S> N- P- T- T>
    `,
  },
  {
    name: "Midnight Express",
    types: "e:van G:bus Q:van R:shuttle",
    closed: "top:8-11 right:0-2 bottom:0-7 left:3-7",
    map: `
      a< a- b^ c< c- d^ e< e- e- f- g- ##
      h^ i^ b- j^ .. d- l^ m^ n- fv gv o-
      h- i- p^ j- ## q^ l- m- nv .. .. ov
      s^ t^ p- u- u> q- v^ w^ x- x> y- z-
      s- t- A- A> B- B> v- w- C- C> yv zv
      D^ E- E> F^ G- G- G- G> H- I- J- K-
      D- L^ M^ F- N- N> O^ P^ Hv Iv Jv Kv
      ## L- M- Q- Q- Q> O- P- R- R- R- R>
    `,
  },
  {
    name: "City Lights",
    types: "c:van R:van S:shuttle",
    closed: "left:* top:0-5 bottom:6-11",
    map: `
      ## a- a> b- c- c- c> d^ e- e> f^ g^
      h- h> i- bv j- k- l^ d- m^ n^ f- g-
      o- o> iv p- jv kv l- q^ m- n- r^ s^
      t- u- v- pv w- x- ## q- y- y> r- s-
      tv uv vv z- wv xv A- A> B^ C^ D- D>
      E- E> F- zv G- G> H- H> B- C- I^ J^
      K- L- Fv M- M> N- .. P^ Q- Q> I- J-
      Kv Lv R- R- R> Nv .. P- S- S- S- S>
    `,
  },
  {
    name: "Penthouse Parking",
    types: "c:bus e:van w:van O:bus",
    closed: "top:0-6 left:0-4 right:5-7 bottom:7-11",
    map: `
      ## a- a> b- c- c- c- c> d^ e- e- e>
      f- ## g- bv h- i- j- k^ d- l^ m^ n^
      fv o- gv p- hv iv jv k- q^ l- m- n-
      r- ov s- pv t- t> u- v^ q- w- w- w>
      rv x- sv y- z- A- uv v- B- B> C^ D^
      E- xv F- yv zv Av G< G- H^ I^ C- D-
      Ev J- Fv K< K- L< L- M^ H- I- ## ..
      .. Jv O< O- O- O- .. M- Q< Q- .. ##
    `,
  },
  {
    name: "Skyline",
    types: "v:shuttle Q:van",
    closed: "top:* right:0-3 left:4-7",
    map: `
      a< a- b- c< c- d- ## e- f- g- h- i-
      j< j- bv k- l- dv m- ev fv gv hv iv
      n< n- o- kv lv p- mv q< q- r< r- s-
      t< t- ov u< u- pv v< v- v- v- w- sv
      ## x- x> y- z- z> A- B- B> C- wv D-
      E- F- F> yv G- G> Av H- H> Cv I- Dv
      Ev J- J> K- L- L> M- N- N> O- Iv P-
      Q- Q- Q> Kv R- R> Mv S- S> Ov .. Pv
    `,
  },
  {
    name: "Rain on Glass",
    types: "q:shuttle U:shuttle",
    closed: "right:* top:0-5 bottom:6-11",
    map: `
      a< a- b< b- c- d- ## e^ f^ g^ h^ i^
      j- k- l< l- cv dv .. e- f- g- h- i-
      jv kv n- o< o- p- q< q- q- q- r< r-
      t< t- nv u- v- pv w< w- x^ y^ z^ ##
      A- B< B- uv vv C- D< D- x- y- z- ..
      Av F- G< G- H- Cv I< I- J^ K^ L< L-
      .. Fv N- O- Hv P- Q< Q- J- K- R< R-
      S< S- Nv Ov .. Pv U< U- U- U- V< V-
    `,
  },
  {
    name: "Last Tram",
    types: "e:van N:van P:bus",
    closed: "top:4-11 right:0-4 bottom:0-3 left:5-7",
    map: `
      a< a- b^ c^ d< d- e< e- e- f- g- **
      h^ i^ b- c- j< j- k- l- m- fv gv n-
      h- i- o^ p^ q< q- kv lv mv r- s- nv
      t< t- o- p- u< u- v< v- w- rv sv x-
      y^ z^ A< A- ** B- C- D- wv E- F- xv
      y- z- G- G> H- Bv Cv Dv I- Ev Fv J-
      .. L^ M- M> Hv N- N- N> Iv O- O> Jv
      ** L- P- P- P- P> Q- Q> .. R- R> ..
    `,
  },
  {
    name: "Afterglow",
    types: "w:shuttle S:shuttle",
    closed: "bottom:* right:0-3 left:4-7",
    map: `
      a< a- b^ c< c- ## d^ e^ f^ g^ h^ i^
      j^ k^ b- l^ m^ .. d- e- f- g- h- i-
      j- k- o^ l- m- p< p- q< q- r< r- ..
      t< t- o- u< u- v< v- w< w- w- w- ##
      ## x^ y- y> z^ A- A> B^ C^ D^ E^ ..
      .. x- H^ I^ z- J- J> B- C- D- E- ..
      L- L> H- I- M^ .. O- O> P^ Q^ R- R>
      S- S- S- S> M- .. U- U> P- Q- V- V>
    `,
  },
  {
    name: "Moonlit Plaza",
    types: "p:van R:bus",
    closed: "top:* left:0-3 right:4-7",
    map: `
      ## a- b- c- d- ## e- e> f- g- g> ..
      i- av bv cv dv j- k- k> fv l- l> ..
      iv m- m> n- o- jv p- p- p> q- r- r>
      s- s> t- nv ov u- u> v- w- qv x- x>
      y< y- tv z< z- A- B- vv wv D- C- ##
      E- F< F- G- H- Av Bv I< I- Dv Cv J-
      Ev K- L- Gv Hv M< M- N- O< O- P- Jv
      .. Kv Lv R< R- R- R- Nv S< S- Pv ..
    `,
  },
  {
    name: "Neon Reflections",
    types: "r:van P:van R:van S:shuttle",
    closed: "left:* top:6-11 bottom:0-5",
    map: `
      a^ b- b> c^ d- d> e- e> f- g- h- h>
      a- i^ j^ c- k^ l^ m- m> fv gv n- o-
      .. i- j- q^ k- l- r- r- r> s- nv ov
      ## t- t> q- u^ v^ w- w> x- sv y- y>
      .. z^ A^ B^ u- v- ## C- xv D- E- F-
      .. z- A- B- H^ I^ J- Cv K- Dv Ev Fv
      L- L> M^ N^ H- I- Jv O- Kv P- P- P>
      ## .. M- N- R- R- R> Ov S- S- S- S>
    `,
  },
  {
    name: "Last Light",
    types: "R:bus",
    closed: "top:7-11 right:0-2 bottom:0-6 left:3-7",
    map: `
      a< a- b^ c< c- d^ e< e- f< f- g- ##
      h^ i^ b- j^ k^ d- l< l- m- n- gv o-
      h- i- p^ j- k- q^ ## .. mv nv r- ov
      s^ t^ p- u^ v^ q- .. ## w- w> rv x-
      s- t- y^ u- v- z^ A- A> B- C- D- xv
      E^ F^ y- G- G> z- H- H> Bv Cv Dv I-
      E- F- J^ K- K> L- L> M- N- O- P- Iv
      ## .. J- R- R- R- R> Mv Nv Ov Pv ..
    `,
  },
  {
    name: "Parking Jam Legend",
    tip: "The final jam. Every rule at once — follow the longest chain home.",
    types: "E:bus H:van",
    closed: "top:0-3 top:5-11 right:0-3 left:4-7 bottom:1-4",
    map: `
      a< a- b< b- c^ d< d- e< e- f- g< g-
      h- i< i- .. c- j< j- k< k- fv l< l-
      hv m< m- n< n- o< o- p< p- q< q- ..
      r- s< s- t< t- u- ## v- w- x- y- ##
      rv z- z> A- A> uv B- vv wv xv yv C-
      D- E- E- E- E> .. Bv F- F> G- G> Cv
      Dv H- H- H> I- I> J- J> K- K> L- L>
      M- M> N- N> O- O> P- P> Q- Q> R- R>
    `,
  },
];
