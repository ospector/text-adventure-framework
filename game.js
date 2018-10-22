function prepareGame(game) {
  game.output.addMessage("greeting")
  game.data = {
    location: "entry",
    beenThere: {},
    items: [
      { name: "storeKey", location : "office", moved: false, uname:"מפתח", opensAt:"vilon", door:"e" },
      { name: "mainKey", location : "dark3", moved: false, uname:"מפתח", opensAt:"exit", door:"s" },
      { name: "torch", location : "warehouse", moved: false, uname:"לפיד" },
      { name: "lighter", location : "smoke", moved: false, uname:"מצית" },
    ],
    inhands: [],
    haveLight: false,
    locked: { "vilon-e":true, "exit-s":true }
  };
}

function makeATurn(game) {
  var cmd = game.input.trim().split(" ")[0];
  switch (cmd) {
  case 'לך':
  case 'רוץ':
  case 'צא':
    go(getDirection(game.input));
    break;
  
  case 'ריסט':
    game.reset();
    break;
  
  case 'תסתכל':
  case 'תביט':
  case 'הסתכל':
  case 'הבט':
    look();
    break;

  case 'קח':
  case 'הרם':
  case 'תרים':
  case 'תקח':
    take();
    break;
  
  case 'זרוק':
  case 'עזוב':
  case 'הורד':
  case 'הנח':
    leave();
    break;

  case 'הדלק':
  case 'הצת':
  case 'הבער':
    lightFire();
    break;

  case 'פתח':
  case 'תפתח':
    openDoor();
    break;

  default:
    dontUnderstand();
    break;
  }
}

function lightFire() {
  if (haveItem("lighter")) {
    if (game.input.indexOf("לפיד")==-1) {
      game.output.addLine("השתגעת!? אין מצב!");
    } else {
      if (haveItem("torch")) {
        game.data.haveLight=true;
        game.output.addLine("וואו - עכשיו יש אור!");
      }
    }
  } else {
    game.output.addLine("איך? נראה לי שחסר לך משהו...");
  }
}

function haveItem(item) {
  var inhands=game.data.inhands;
  for (i=0; i<inhands.length ; i++ ) {
    if (inhands[i].name==item) return true;
  }
  return false;
}

function openDoor() {
  var inhands=game.data.inhands;
  for (i=0; i<inhands.length ; i++ ) {
    var item = inhands[i];
    if (item.opensAt==game.data.location) {
      item.location="used";
      game.data.locked[item.opensAt+"-"+item.door] = false;
      inhands.splice(i,1);
      game.output.addLine("הדלת פתוחה");
      return;
    }
  }
  game.output.addLine("אין לי מפתח מתאים");
}

function take() {
  var items = game.data.items;
  var itemNames = [];
  for (i=0; i<items.length; i++ ) {
    var item = items[i];
    if (item.location==game.data.location && game.input.indexOf(item.uname) !== -1) {
      item.location="hand";
      item.moved=true;
      game.data.inhands.push(item);
      game.output.addLine("לקחתי");
      return;
    }
  }
  game.output.addLine("אין דבר כזה בחדר");
}

function leave() {
  var inhands=game.data.inhands;
  for (i=0; i<inhands.length ; i++ ) {
    var item = inhands[i];
    if (game.input.indexOf(item.uname)) {
      item.location=game.data.location;
      inhands.splice(i,1);
      game.output.addLine("הנחתי אותו על הרצפה");
      return;
    }
  }
  game.output.addLine("לא מחזיק דבר כזה");
}

function dontUnderstand() {
  game.output.addLine("לא הבנתי");
}

function getDirection(str) {
  var dir = "x";
  if (str.indexOf("צפו") !== -1) dir="n";
  if (str.indexOf("דרו") !== -1) dir="s";
  if (str.indexOf("מזרח") !== -1) dir="e";
  if (str.indexOf("מערב") !== -1) dir="w";
  return dir;
}

function go(dir) {
  if (game.data.locked[game.data.location+"-"+dir]) {
    game.output.addLine("הדלת נעולה!");
    return;
  }

  var curRoom = game.constants.map[game.data.location];
  var nextRoom = curRoom[dir];
  if (typeof nextRoom=='undefined') {
    game.output.addLine("דפקתי את הראש בקיר. אאו!");
  } else {
    game.data.location=nextRoom;
    if (game.data.beenThere[game.data.location]) game.output.addLine("אוקיי"); 
    else look();
  }
}

function look() {
  if (game.data.location.indexOf("dark")>-1 && !game.data.haveLight) {
    game.output.addLine("חושך מצריים - אני לא רואה כלום");
  } else {
    game.output.addMessage(game.data.location);
    var curRoom = game.constants.map[game.data.location];
    listItems(game.data.location);
    listDoors(curRoom);
    game.data.beenThere[game.data.location]=true;
  }
}

function listItems(curLocation) {
  var items = game.data.items;
  var itemNames = [];
  for (i=0; i<items.length; i++ ) {
    var item = items[i];
    if (item.location==curLocation) {
      if (item.moved) {
        itemNames.push(item.name);
      } else {
        game.output.addMessage(item.name+"-init");
      }
    }
    if (itemNames.length==1) {
      game.output.addText("על הרצפה מונח ");
      game.output.addMessage(itemNames[0]);
    } else if (itemNames.length>1) {
      game.output.addLine("");
      for (i=0; i<itemNames.length ; i++ ) game.output.addLine(itemNames[i]);
    }
  }
}

function listDoors(curRoom) {
  var doors = [];
  if (curRoom.n) doors.push("צפון");
  if (curRoom.s) doors.push("דרום");
  if (curRoom.e) doors.push("מזרח");
  if (curRoom.w) doors.push("מערב");
  if (doors.length==1) {
    game.output.addMessage("יש דלת מכיוון "+doors[0]);
  } else if (doors.length>0) {
    var last = doors.pop();
    var d=doors.join(", ");
    game.output.addLine("יש דלתות מכיוון "+d+" ו"+last);
  }
}
