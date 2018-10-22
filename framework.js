 var out = "";
 var displayStrings = {};
 var game = {
   input: "",
   output: {
     addLine: function(s) { out+=s; out+="<br>"; },
     addText: function(s) { out+=s; },
     addMessage: function(key) { if (displayStrings[key]) game.output.addText(displayStrings[key]);}
   },
   reset: function() { 
     clearState(); 
     loadState();
     clearStdout();
     callUserInit();
     out="";
     getStdin().value="";
   }
 }

 function init() {
   initDisplayStrings();
   game.constants = constants? constants : {};
   if (!loadState()) callUserInit()
   registerListeners();
   getStdin().focus();
 }

 function callUserInit() {
   prepareGame(game);
   persistState();
   outputText(out,"game");
 }
 
function initDisplayStrings() {
  var ds = messages.split("\n");
  var key = "key";
  var val ="";
  for (i=1; i<ds.length; i++ ) {
    if (ds[i].charAt(0)=='=') {
      if (val.length>0) {
        displayStrings[key]=val;
      }
      key = extractKey(ds[i]);
      val="";
    } else {
      val += ds[i] + "<br/>";
    }
  }
  if (val.length>0) {
    displayStrings[key]=val;
  }
}

 function extractKey(k) {
   return k.substr(1);
 }

 function registerListeners() {
    var  stdin = getStdin();
    stdin.addEventListener("keydown", function (e) {
        if (e.keyCode === 13) {  //checks whether the pressed key is "Enter"
            turn(stdin.value);
        }
    });
 }

 function getStdin() {
   return document.getElementById("stdin");
 }

 //
 // State management
 //
 var STATE_KEY="game";

 function loadState() {
   var data = localStorage.getItem(STATE_KEY);
   if (data) {
     game.data = JSON.parse(data);
     return true;
   } else {
     game.data ={};
     return false;
   }
 }
 
 function persistState() {
   if (game.data) {
     localStorage.setItem(STATE_KEY,JSON.stringify(game.data));
   }
 }

 function clearState() {
   localStorage.removeItem(STATE_KEY);
 }

 function turn(input) {
    out="";
    game.input = input
    makeATurn(game);
    persistState();
    outputText(getStdin().value,"player");
    outputText(out,"game");
    getStdin().value="";
 }

 function clearStdout() {
   var stdout = document.getElementById("stdout");
   while (stdout.firstChild) stdout.removeChild(stdout.firstChild);
 }

 function outputText(txt,cls) {
   var div = document.createElement("div");
   div.className=cls;
   div.innerHTML = txt;
   var stdout = document.getElementById("stdout");
   stdout.appendChild(div);
   stdout.scrollTop = stdout.scrollHeight;
 }
