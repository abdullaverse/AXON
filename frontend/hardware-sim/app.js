const $ = (id)=>document.getElementById(id);

const state = {
  scenario:"normal", running:false, paused:false, t:0, last:performance.now(), networkFailed:false, backendSync:false,
  sensors:{rain:5, soil:30, vib:0.04, water:1.2, temp:28, hum:65, smoke:5, pm25:25},
  risks:{land:null,flood:8,fire:4,poll:12}, selected:"H01", lastStage:"SYSTEM NORMAL"
};

const hardware = {
H01:{
  components:[
    ["ESP32 DevKit V1","Main controller / edge logic"],
    ["SX1278 / SX1276 LoRa","Long-range resilient field communication"],
    ["Capacitive Soil Moisture Sensor","Slope saturation measurement"],
    ["Rain Gauge / Rain Sensor","Local rainfall input"],
    ["MPU6050","Vibration / tilt / slope movement"],
    ["BME280","Temperature, humidity, pressure"],
    ["NEO-6M GPS (optional)","Node position / deployment reference"],
    ["0.96in I2C OLED (optional)","Local maintenance/status"],
    ["18650 Li-ion battery pack","Backup / autonomous supply"],
    ["Solar panel","Remote charging"],
    ["TP4056 / solar charge controller","Battery charging/protection"],
    ["5V/3.3V regulator","Stable ESP32/sensor supply"],
    ["Status LED + resistor","Node health indication"],
    ["Weatherproof enclosure + antenna","Outdoor deployment"]
  ],
  pins:[
    ["Soil moisture","GPIO34 ADC","Analog moisture"],
    ["Rain sensor","GPIO35 ADC","Analog rainfall/demo input"],
    ["MPU6050 SDA","GPIO21","I2C data"],
    ["MPU6050 SCL","GPIO22","I2C clock"],
    ["BME280 SDA/SCL","GPIO21/22","Shared I2C bus"],
    ["LoRa NSS/CS","GPIO5","SPI chip select"],
    ["LoRa SCK","GPIO18","SPI clock"],
    ["LoRa MISO","GPIO19","SPI MISO"],
    ["LoRa MOSI","GPIO23","SPI MOSI"],
    ["LoRa RST","GPIO14","Radio reset"],
    ["LoRa DIO0","GPIO26","Radio interrupt"],
    ["OLED","GPIO21/22","Shared I2C"],
    ["Status LED","GPIO2","Digital output"]
  ],
  blocks:[
    ["POWER","Solar panel → charge controller → battery → regulator","power"],
    ["ESP32","Sampling + local validation + edge logic","core"],
    ["SENSORS","Rain + soil + MPU6050 + BME280",""],
    ["LoRa","SX127x SPI radio → antenna","comm"],
    ["LOCAL","OLED / LED / local buffer",""],
    ["PROTECTION","Weatherproof enclosure + fuse/reverse polarity",""]
  ],
  svg:[
    ["Solar / Battery",40,35,"power"],["Regulator",210,35,"power"],["ESP32",375,90,"core"],
    ["Soil Sensor",40,180,""],["Rain Sensor",190,180,""],["MPU6050",340,180,""],["BME280",490,180,""],
    ["SX1278 LoRa",650,80,"comm"],["Antenna",650,180,"comm"],["OLED / LED",520,35,"act"]
  ],
  wires:[
    [140,62,210,62,"power"],[310,62,390,95,"power"],
    [140,205,375,130,""],[290,205,390,130,""],[440,205,415,140,""],[590,205,440,140,""],
    [475,115,650,110,"comm"],[700,135,700,180,"comm"],[475,105,520,62,""]
  ]
},
R01:{
  components:[
    ["ESP32 DevKit V1","Flood-node controller"],
    ["SX1278 / SX1276 LoRa","Long-range communication"],
    ["JSN-SR04T Waterproof Ultrasonic","River/water level"],
    ["Tipping Bucket Rain Gauge","Rainfall"],
    ["BME280","Temperature/humidity/pressure"],
    ["Optional flow sensor","Flow velocity proxy"],
    ["NEO-6M GPS (optional)","Node location"],
    ["OLED / status LED","Local status"],
    ["Battery pack","Autonomous power"],
    ["Solar panel","Charging source"],
    ["Charge controller","Battery charge/protection"],
    ["Buck regulator","Stable supply"],
    ["Weatherproof raised enclosure","Flood-resistant installation"]
  ],
  pins:[
    ["JSN-SR04T TRIG","GPIO27","Trigger output"],
    ["JSN-SR04T ECHO","GPIO33","Echo input via divider if required"],
    ["Rain gauge","GPIO32","Pulse / digital input"],
    ["BME280","GPIO21/22","I2C"],
    ["LoRa NSS","GPIO5","SPI CS"],["LoRa SCK","GPIO18","SPI"],
    ["LoRa MISO","GPIO19","SPI"],["LoRa MOSI","GPIO23","SPI"],
    ["LoRa RST","GPIO14","Reset"],["LoRa DIO0","GPIO26","Interrupt"],
    ["Status LED","GPIO2","Output"]
  ],
  blocks:[
    ["POWER","Solar → charge controller → battery → regulator","power"],
    ["ESP32","Water-level sampling + local risk logic","core"],
    ["SENSORS","Water level + rain + BME280",""],
    ["LoRa","SX127x SPI radio","comm"],
    ["LOCAL","Status LED / local storage",""],["PROTECTION","Raised IP enclosure + waterproof glands",""]
  ],
  svg:[
    ["Solar / Battery",40,35,"power"],["Regulator",210,35,"power"],["ESP32",375,90,"core"],
    ["JSN-SR04T",60,180,""],["Rain Gauge",230,180,""],["BME280",400,180,""],
    ["SX1278 LoRa",650,80,"comm"],["Antenna",650,180,"comm"],["Status",520,35,"act"]
  ],
  wires:[[140,62,210,62,"power"],[310,62,390,95,"power"],[160,205,375,130,""],[330,205,390,135,""],[500,205,425,140,""],[475,115,650,110,"comm"],[700,135,700,180,"comm"],[475,105,520,62,""]]
},
F01:{
  components:[
    ["ESP32 DevKit V1","Forest-fire node controller"],["SX1278 / SX1276 LoRa","Resilient communication"],
    ["BME280 / DHT22","Temperature and humidity"],["MQ-2 / MQ-135","Smoke/gas proxy sensing"],
    ["Flame sensor (optional)","Local optical flame indication"],["OLED / status LED","Local status"],
    ["Battery pack","Backup power"],["Solar panel","Remote charging"],["Charge controller","Battery management"],
    ["Regulator","Stable supply"],["Weather-resistant enclosure","Outdoor node protection"]
  ],
  pins:[
    ["BME280","GPIO21/22","I2C"],["MQ analog","GPIO34","ADC"],
    ["Flame sensor","GPIO27","Digital/analog as module allows"],
    ["LoRa NSS","GPIO5","SPI CS"],["LoRa SCK","GPIO18","SPI"],["LoRa MISO","GPIO19","SPI"],["LoRa MOSI","GPIO23","SPI"],
    ["LoRa RST","GPIO14","Reset"],["LoRa DIO0","GPIO26","Interrupt"],["Status LED","GPIO2","Output"]
  ],
  blocks:[
    ["POWER","Solar → battery → regulated rail","power"],["ESP32","Fire-weather + smoke processing","core"],
    ["SENSORS","BME280 + MQ + optional flame",""],["LoRa","SX127x SPI radio","comm"],
    ["LOCAL","Status display / LED",""],["PROTECTION","Weather / heat-aware enclosure",""]
  ],
  svg:[
    ["Solar / Battery",40,35,"power"],["Regulator",210,35,"power"],["ESP32",375,90,"core"],
    ["BME280",80,180,""],["MQ Smoke/Gas",270,180,""],["Flame Sensor",470,180,""],
    ["SX1278 LoRa",650,80,"comm"],["Antenna",650,180,"comm"],["OLED / LED",520,35,"act"]
  ],
  wires:[[140,62,210,62,"power"],[310,62,390,95,"power"],[180,205,375,130,""],[370,205,395,135,""],[570,205,430,140,""],[475,115,650,110,"comm"],[700,135,700,180,"comm"],[475,105,520,62,""]]
},
A01:{
  components:[
    ["ESP32 DevKit V1","Air-quality node controller"],["SX1278 / SX1276 LoRa","Long-range communication"],
    ["PMS5003 / PMS7003","PM2.5 / PM10 particulate sensor"],["MQ-135","Gas / air-quality proxy"],
    ["BME280 / DHT22","Temperature and humidity"],["Optional small fan/inlet","Controlled sensor airflow"],
    ["OLED / status LED","Local status"],["Battery pack","Autonomous power"],["Solar panel","Charging"],
    ["Charge controller","Battery management"],["Regulator","Stable supply"],["Weather shield","Protected air inlet"]
  ],
  pins:[
    ["PMS TX","GPIO16 RX2","UART receive"],["PMS RX","GPIO17 TX2","UART transmit"],
    ["MQ-135","GPIO34","ADC"],["BME280","GPIO21/22","I2C"],
    ["LoRa NSS","GPIO5","SPI CS"],["LoRa SCK","GPIO18","SPI"],["LoRa MISO","GPIO19","SPI"],["LoRa MOSI","GPIO23","SPI"],
    ["LoRa RST","GPIO14","Reset"],["LoRa DIO0","GPIO26","Interrupt"],["Fan (optional)","GPIO25 via transistor","Output"]
  ],
  blocks:[
    ["POWER","Solar → battery → regulator","power"],["ESP32","Air-quality sampling + packetization","core"],
    ["SENSORS","PMS + MQ-135 + BME280",""],["LoRa","SX127x SPI radio","comm"],
    ["AIR PATH","Protected inlet + optional fan",""],["PROTECTION","Weather shield / filtered inlet",""]
  ],
  svg:[
    ["Solar / Battery",40,35,"power"],["Regulator",210,35,"power"],["ESP32",375,90,"core"],
    ["PMS5003",60,180,""],["MQ-135",250,180,""],["BME280",430,180,""],
    ["SX1278 LoRa",650,80,"comm"],["Antenna",650,180,"comm"],["Fan / OLED",520,35,"act"]
  ],
  wires:[[140,62,210,62,"power"],[310,62,390,95,"power"],[160,205,375,130,""],[350,205,395,135,""],[530,205,430,140,""],[475,115,650,110,"comm"],[700,135,700,180,"comm"],[475,105,520,62,""]]
},
T01:{
  components:[
    ["ESP32 DevKit V1","Relay/tower controller"],["SX1278 / SX1276 LoRa","Field packet receive/transmit"],
    ["External high-gain LoRa antenna","Extended line-of-sight coverage"],["Optional GPS","Tower location/time reference"],
    ["MicroSD module (optional)","Store-and-forward buffer"],["Status LEDs","Link/health indication"],
    ["Larger battery pack","Longer autonomy"],["Solar panel","Primary remote power"],["Solar charge controller","Battery management"],
    ["Buck regulator","5V/3.3V rails"],["Lightning/surge protection","Tower protection"],["Weatherproof enclosure","Outdoor installation"]
  ],
  pins:[
    ["LoRa NSS","GPIO5","SPI CS"],["LoRa SCK","GPIO18","SPI"],["LoRa MISO","GPIO19","SPI"],["LoRa MOSI","GPIO23","SPI"],
    ["LoRa RST","GPIO14","Reset"],["LoRa DIO0","GPIO26","Interrupt"],
    ["MicroSD CS (optional)","GPIO13","Separate SPI CS"],["GPS TX/RX","GPIO16/17","UART2"],["Status LEDs","GPIO2/4","Outputs"]
  ],
  blocks:[
    ["POWER","Larger solar + battery + regulator","power"],["ESP32","Packet relay / store-and-forward","core"],
    ["LoRa","Receive + retransmit emergency packets","comm"],["ANTENNA","Elevated high-gain outdoor antenna","comm"],
    ["BUFFER","Optional MicroSD/local queue",""],["PROTECTION","Surge/lightning/weather protection",""]
  ],
  svg:[
    ["Solar Panel",40,35,"power"],["Battery / Reg",210,35,"power"],["ESP32",375,90,"core"],
    ["MicroSD",120,180,""],["GPS",300,180,""],["SX1278 LoRa",650,80,"comm"],
    ["High-gain Antenna",630,180,"comm"],["Status LEDs",520,35,"act"]
  ],
  wires:[[140,62,210,62,"power"],[310,62,390,95,"power"],[220,205,385,135,""],[400,205,405,140,""],[475,115,650,110,"comm"],[700,135,700,180,"comm"],[475,105,520,62,""]]
},
C01:{
  components:[
    ["ESP32 DevKit V1","Community safety controller"],["SX1278 / SX1276 LoRa","Emergency packet receiver"],
    ["0.96in OLED or 16x2/20x4 LCD","Hazard / route instructions"],["4 Direction LEDs + resistors","N/E/S/W or arrow guidance"],
    ["12V Siren","Audible community alert"],["Logic-level N-MOSFET e.g. IRLZ44N / suitable driver","Switch siren safely"],
    ["Flyback diode (if inductive load/relay)","Driver protection"],["Relay module (alternative to MOSFET)","Isolated siren switching option"],
    ["Local Wi-Fi AP via ESP32","Nearby phone/operator access without Internet"],["Push button / acknowledge switch","Local acknowledgement/reset"],
    ["Battery backup","Operation during grid failure"],["Mains/solar charger","Battery charging"],
    ["5V/3.3V regulator","Controller/display supply"],["Fuse + enclosure","Safety and physical protection"]
  ],
  pins:[
    ["LoRa NSS","GPIO5","SPI CS"],["LoRa SCK","GPIO18","SPI"],["LoRa MISO","GPIO19","SPI"],["LoRa MOSI","GPIO23","SPI"],
    ["LoRa RST","GPIO14","Reset"],["LoRa DIO0","GPIO26","Interrupt"],
    ["OLED SDA/SCL","GPIO21/22","I2C"],["North LED","GPIO32","Output"],["East LED","GPIO33","Output"],
    ["South LED","GPIO25","Output"],["West LED","GPIO27","Output"],
    ["Siren MOSFET gate","GPIO4","Output through gate resistor"],["Acknowledge button","GPIO13","Input pull-up"]
  ],
  blocks:[
    ["POWER","Battery backup + charger → regulated ESP32 rail","power"],["ESP32","Packet parse + local Wi-Fi AP + alert logic","core"],
    ["LoRa RX","SX127x receives hazard/route packet","comm"],["DISPLAY","OLED/LCD displays hazard + safe point","act"],
    ["DIRECTION","4 direction LEDs / arrow panel","act"],["SIREN","GPIO → MOSFET/relay → separate 12V siren supply","act"]
  ],
  svg:[
    ["Battery / Charger",40,35,"power"],["5V / 3.3V Reg",210,35,"power"],["ESP32",375,90,"core"],
    ["SX1278 LoRa",70,180,"comm"],["OLED / LCD",260,180,"act"],["Direction LEDs",460,180,"act"],
    ["MOSFET / Relay",650,80,"act"],["12V Siren",650,180,"act"],["Wi-Fi Local AP",520,35,"comm"]
  ],
  wires:[[140,62,210,62,"power"],[310,62,390,95,"power"],[170,205,390,135,"comm"],[360,205,405,140,""],[560,205,430,140,""],[475,115,650,110,""],[700,135,700,180,""],[475,105,520,62,"comm"]]
}
};

function renderDetailedCircuit(node){
  const h=hardware[node];
  $("componentList").innerHTML=h.components.map((c,i)=>`<div class="comp-row"><span class="comp-no">${String(i+1).padStart(2,"0")}</span><span class="comp-name">${c[0]}</span><span class="comp-use">${c[1]}</span></div>`).join("");
  $("pinTable").innerHTML=`<div class="pin-row head"><span>Device / signal</span><span>ESP32 pin</span><span>Purpose</span></div>`+
    h.pins.map(p=>`<div class="pin-row"><span>${p[0]}</span><span>${p[1]}</span><span>${p[2]}</span></div>`).join("");
  const boxes=h.svg.map(([label,x,y,cls])=>`<g><rect class="cbox ${cls||""}" x="${x}" y="${y}" width="130" height="54" rx="7"/><text class="ctitle" x="${x+10}" y="${y+22}">${label}</text><text class="csub" x="${x+10}" y="${y+39}">${cls==="power"?"POWER":cls==="comm"?"COMM":"I/O"}</text></g>`).join("");
  const wires=h.wires.map(([x1,y1,x2,y2,cls])=>`<path class="cwire ${cls||""}" d="M${x1} ${y1} C ${(x1+x2)/2} ${y1}, ${(x1+x2)/2} ${y2}, ${x2} ${y2}"/>`).join("");
  $("circuitCanvas").innerHTML=`<svg viewBox="0 0 820 255" aria-label="${node} circuit diagram">${wires}${boxes}</svg>`;
  $("circuitDiagram").innerHTML=h.blocks.map(([a,b,c])=>`<div class="block ${c||""}"><h3>${a}</h3><p>${b}</p></div>`).join("");
}

function renderCircuit(){
  $("selectedNode").textContent=state.selected;
  renderDetailedCircuit(state.selected);
  document.querySelectorAll(".node").forEach(n=>n.classList.toggle("active",n.dataset.node===state.selected));
}

document.querySelectorAll(".node").forEach(n=>n.addEventListener("click",()=>{
  state.selected=n.dataset.node;
  renderCircuit();
}));

// =====================================================================
// AXON SHARED-BACKEND CLIENT
// Hardware Twin and Command Center now use ONE digital-twin state.
// This page no longer advances a separate browser-only disaster.
// =====================================================================
const API = {
  state: "/simulation/state",
  intelligence: "/simulation/intelligence",
  start: "/simulation/start",
  pause: "/simulation/pause",
  reset: "/simulation/reset",
  scenario: "/simulation/scenario",
  networkToggle: "/simulation/network-toggle"
};

let selectedScenario = "NORMAL";
let lastSnapshot = "";
let pollBusy = false;
let backendOnline = false;

function log(type,msg,alert=false){
  const el=document.createElement("div");
  el.className="event"+(alert?" alert":"");
  el.innerHTML=`<b>${new Date().toLocaleTimeString()}</b> · ${type} · ${msg}`;
  $("eventLog").prepend(el);
  while($("eventLog").children.length>60)$("eventLog").lastChild.remove();
}

async function requestJSON(url, options={}){
  const r=await fetch(url,{cache:"no-store",...options});
  if(!r.ok){
    const text=await r.text();
    throw new Error(`${r.status} ${r.statusText}${text?": "+text.slice(0,180):""}`);
  }
  const ct=r.headers.get("content-type")||"";
  return ct.includes("application/json") ? r.json() : {};
}

async function postWithFallback(kind, payload={}){
  // Compatible with the endpoint styles used during AXON development.
  const attempts=[];
  if(kind==="start"){
    attempts.push(
      [API.start,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({scenario:selectedScenario})}],
      [`${API.start}?scenario=${encodeURIComponent(selectedScenario)}`,{method:"POST"}],
      [API.scenario,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({scenario:selectedScenario,action:"start"})}]
    );
  }else if(kind==="pause"){
    attempts.push([API.pause,{method:"POST"}],[API.scenario,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({scenario:selectedScenario,action:"pause"})}]);
  }else if(kind==="reset"){
    attempts.push([API.reset,{method:"POST"}],[API.scenario,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({scenario:"NORMAL",action:"reset"})}]);
  }else if(kind==="network"){
    attempts.push(
      [API.networkToggle,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({failed:payload.failed,network_failed:payload.failed})}],
      [`${API.networkToggle}?failed=${payload.failed}`,{method:"POST"}]
    );
  }
  let err;
  for(const [u,o] of attempts){
    try{return await requestJSON(u,o)}catch(e){err=e}
  }
  throw err||new Error("No compatible backend endpoint");
}

document.querySelectorAll(".mode").forEach(btn=>btn.addEventListener("click",async()=>{
  document.querySelectorAll(".mode").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  selectedScenario=(btn.dataset.scn||"normal").toUpperCase();
  log("CONTROL",`Scenario armed: ${selectedScenario}`);
}));

$("startBtn").addEventListener("click",async()=>{
  try{
    await postWithFallback("start");
    log("BACKEND",`${selectedScenario} started — shared AXON digital twin`);
    await pollBackend(true);
  }catch(e){log("ERROR","START failed: "+e.message,true)}
});

$("pauseBtn").addEventListener("click",async()=>{
  try{
    await postWithFallback("pause");
    log("BACKEND","Shared simulation pause/resume command sent");
    await pollBackend(true);
  }catch(e){log("ERROR","PAUSE failed: "+e.message,true)}
});

$("resetBtn").addEventListener("click",async()=>{
  try{
    await postWithFallback("reset");
    selectedScenario="NORMAL";
    document.querySelectorAll(".mode").forEach(b=>b.classList.toggle("active",b.dataset.scn==="normal"));
    log("BACKEND","Shared digital twin reset");
    await pollBackend(true);
  }catch(e){log("ERROR","RESET failed: "+e.message,true)}
});

$("networkFail").addEventListener("change",async e=>{
  const wanted=e.target.checked;
  try{
    await postWithFallback("network",{failed:wanted});
    log("NETWORK",wanted?"Internet/cellular failure injected in shared backend":"Internet restored in shared backend",wanted);
    await pollBackend(true);
  }catch(err){
    // Do not fake a backend network state.
    e.target.checked=!wanted;
    log("ERROR","NETWORK command failed: "+err.message,true);
  }
});

// This checkbox is retained as a status/control hint, but backend sync is mandatory.
$("backendSync").checked=true;
$("backendSync").disabled=true;
$("backendSync").title="Shared backend synchronization is mandatory in interconnected mode";

function num(v,fallback=0){v=Number(v);return Number.isFinite(v)?v:fallback}
function first(...vals){return vals.find(v=>v!==undefined&&v!==null)}

function applySimulation(sim){
  if(!sim)return;
  state.running=!!sim.running;
  state.paused=!!sim.paused;
  state.t=num(first(sim.elapsed,sim.clock,sim.t),state.t);
  state.networkFailed=!!first(sim.network_failed,sim.networkFailed,false);
  state.lastStage=String(first(sim.stage,"SYSTEM NORMAL"));
  if(sim.scenario) selectedScenario=String(sim.scenario).toUpperCase();

  const s=sim.sensors||{};
  state.sensors.rain=num(first(s.rainfall,s.rain),state.sensors.rain);
  state.sensors.soil=num(first(s.soil_moisture,s.soil),state.sensors.soil);
  state.sensors.vib=num(first(s.vibration,s.vib),state.sensors.vib);
  state.sensors.water=num(first(s.water_level_m,s.water),state.sensors.water);
  state.sensors.temp=num(first(s.temperature,s.temp),state.sensors.temp);
  state.sensors.hum=num(first(s.humidity,s.hum),state.sensors.hum);
  state.sensors.smoke=num(s.smoke,state.sensors.smoke);
  state.sensors.pm25=num(first(s.pm25,s["PM2.5"]),state.sensors.pm25);

  $("networkFail").checked=state.networkFailed;
  document.querySelectorAll(".mode").forEach(b=>{
    const bscn=(b.dataset.scn||"").toUpperCase();
    b.classList.toggle("active", bscn===selectedScenario || (selectedScenario==="HEAVY_RAIN"&&bscn==="RAIN"));
  });
}

function hazardRisk(h,name,fallback){
  const x=h?.[name];
  if(x==null)return fallback;
  if(typeof x==="number")return x;
  return num(first(x.risk,x.score,x.probability!=null?x.probability*100:null),fallback);
}

function applyIntelligence(d){
  const intel=d?.intelligence||d||{};
  const hz=intel.hazards||{};
  state.risks.land=hazardRisk(hz,"landslide",state.risks.land);
  state.risks.flood=hazardRisk(hz,"flood",state.risks.flood);
  state.risks.fire=hazardRisk(hz,"fire",state.risks.fire);
  state.risks.poll=hazardRisk(hz,"pollution",state.risks.poll);

  const evac=intel.evacuation||{};
  const route=intel.safe_route||{};
  if(evac.required){
    const dest=first(route.destination,evac.destination,"SAFE POINT");
    const path=Array.isArray(route.path)?route.path.join(" → "):"";
    activateCommunity(`${String(first(evac.dominant_hazard,"HAZARD")).toUpperCase()} WARNING\nEVACUATE → ${dest}${path?`\n${path}`:""}`);
  }else{
    normalCommunity();
  }
}

function activateCommunity(text){
  $("sirenState").textContent="ACTIVE";
  $("sirenState").style.color="#ff7474";
  $("ledState").textContent="EVACUATE";
  $("ledState").style.color="#eabf5a";
  $("displayText").textContent=text;
  document.querySelector('[data-node="C01"]').classList.add("warning");
  $("cMini").textContent="SIREN ACTIVE · ROUTE DISPLAYED";
}
function normalCommunity(){
  $("sirenState").textContent="READY";
  $("sirenState").style.color="";
  $("ledState").textContent="READY";
  $("ledState").style.color="";
  $("displayText").textContent="SYSTEM NORMAL";
  document.querySelector('[data-node="C01"]').classList.remove("warning");
  $("cMini").textContent="SIREN READY · DISPLAY READY";
}

function updateNetwork(){
  if(state.networkFailed){
    $("internetBadge").textContent="INTERNET OFFLINE";
    $("internetBadge").className="badge alert";
    $("loraBadge").textContent="LoRa MESH ACTIVE";
    $("loraBadge").className="badge ok";
  }else{
    $("internetBadge").textContent="INTERNET ONLINE";
    $("internetBadge").className="badge ok";
    $("loraBadge").textContent="LoRa MESH READY";
    $("loraBadge").className="badge ok";
  }
}

function setRisk(id,bar,v){
  $(id).textContent=v==null?"—":`${num(v).toFixed(1)}%`;
  $(bar).style.width=`${Math.max(0,Math.min(100,num(v)))}%`;
}

function render(){
  const s=state.sensors;
  $("clock").textContent=`${String(Math.floor(state.t/60)).padStart(2,"0")}:${String(Math.floor(state.t%60)).padStart(2,"0")}`;
  $("stage").textContent=state.lastStage;
  $("progressBar").style.width=`${Math.min(state.t/45*100,100)}%`;

  $("rainOut").textContent=s.rain.toFixed(0); $("soilOut").textContent=s.soil.toFixed(0);
  $("vibOut").textContent=s.vib.toFixed(2); $("waterOut").textContent=s.water.toFixed(2);
  $("tempOut").textContent=s.temp.toFixed(0); $("humOut").textContent=s.hum.toFixed(0);
  $("smokeOut").textContent=s.smoke.toFixed(0); $("pmOut").textContent=s.pm25.toFixed(0);

  // Sliders are mirrors of backend sensor state in interconnected mode.
  $("rain").value=s.rain; $("soil").value=s.soil; $("vib").value=s.vib*100; $("water").value=s.water*100;
  $("temp").value=s.temp; $("hum").value=s.hum; $("smoke").value=s.smoke; $("pm").value=s.pm25;

  $("hMini").textContent=`Rain ${s.rain.toFixed(0)} · Soil ${s.soil.toFixed(0)}% · Vib ${s.vib.toFixed(2)}`;
  $("rMini").textContent=`Water ${s.water.toFixed(2)} m · Rain ${s.rain.toFixed(0)}`;
  $("fMini").textContent=`Temp ${s.temp.toFixed(0)}°C · Smoke ${s.smoke.toFixed(0)}%`;
  $("aMini").textContent=`PM2.5 ${s.pm25.toFixed(0)} µg/m³`;

  setRisk("landRisk","landBar",state.risks.land);
  setRisk("floodRisk","floodBar",state.risks.flood);
  setRisk("fireRisk","fireBar",state.risks.fire);
  setRisk("pollRisk","pollBar",state.risks.poll);

  $("landProv").textContent="MODEL · SHARED AXON BACKEND";
  $("backendBadge").textContent=backendOnline?"SHARED BACKEND CONNECTED":"BACKEND DISCONNECTED";
  $("backendBadge").className=backendOnline?"badge ok":"badge alert";
  updateNetwork();
}

// Manual sliders must not create a private fake state.
// If your backend later exposes /simulation/sensors, these can be wired to it.
["rain","soil","vib","water","temp","hum","smoke","pm"].forEach(id=>{
  $(id).disabled=true;
  $(id).title="Driven by the shared AXON digital-twin backend";
});

async function pollBackend(force=false){
  if(pollBusy&&!force)return;
  pollBusy=true;
  try{
    const [sim,intel]=await Promise.all([
      requestJSON(API.state),
      requestJSON(API.intelligence)
    ]);
    backendOnline=true;
    applySimulation(sim);
    applyIntelligence(intel);

    const snap=JSON.stringify({
      scenario:sim?.scenario,stage:sim?.stage,network:sim?.network_failed,
      evac:(intel?.intelligence||intel)?.evacuation
    });
    if(lastSnapshot && snap!==lastSnapshot){
      log("SYNC",`${first(sim?.stage,sim?.scenario,"STATE")} · both AXON views updated`);
    }
    lastSnapshot=snap;
  }catch(e){
    backendOnline=false;
    $("backendBadge").textContent="BACKEND DISCONNECTED";
    $("backendBadge").className="badge alert";
  }finally{
    render();
    pollBusy=false;
  }
}

renderCircuit();
render();
log("SYSTEM","Interconnected Hardware Twin ready — backend is single source of truth");
pollBackend(true);
setInterval(()=>pollBackend(false),750);
