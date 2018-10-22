var constants = {
  map : {
    nw: { e:"mirrors", s:"battle" },
    mirrors: { e:"smoke",w:"nw" },
    smoke: { e:"vilon",w:"mirrors" },
    vilon: { e:"warehouse",s:"entry",w:"smoke" },
    warehouse: { w:"vilon" },

    battle: { n:"nw",s:"knight" },
    tooffice: { e:"entry",s:"toknight" },
    entry: { n:"vilon",e:"office",s:"portrait",w:"tooffice" },
    office: { w:"entry" },

    knight: { n:"battle",e:"toexit" },
    toexit: { e:"toknight",s:"darkpersian",w:"knight" },
    toknight: { n:"tooffice", w:"toexit" },
    portrait: { n:"entry",e:"dark1" },
    dark1: { s:"dark2",w:"portrait" },

    darkpersian: { n:"toexit",e:"exit" },
    exit: { e:"dark3",s:"win",w:"darkpersian" },
    dark3: { e:"dark2",w:"exit" },
    dark2: { n:"dark1",w:"dark3" },
    
    win: {}
  }
}