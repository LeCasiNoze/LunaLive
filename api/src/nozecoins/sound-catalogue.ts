// Sources supplied by the channel owner. Durations measured with ffprobe, 2026-10-15.
// Preview is free; purchases remain independently gated by OBS and the feature flag.
export const DEFAULT_SOUND_CATALOGUE=[
 {id:'bouh',label:'BOUUUUUUUH',file:'bouuuuuuuh',durationMs:5695},
 {id:'etuftg',label:'Et… FTG',file:'etuftg',durationMs:3684},
 {id:'kwa',label:'KWAAAA !',file:'kwaaaaaaaaaqgfrthyjuki',durationMs:7628},
 {id:'here-comes-the-money',label:'Here comes the money',file:'here-come-the-money-casinoze',durationMs:9091},
 {id:'soleil',label:'Soleil !',file:'soleill',durationMs:3893},
 {id:'nom-du-ciel',label:'Au nom du ciel',file:'ononduciel',durationMs:5774},
 {id:'zwiii',label:'Zwiii !',file:'zqdzqdzwiii',durationMs:2038},
].map(({file,...entry})=>({...entry,audioUrl:`https://www.myinstants.com/media/sounds/${file}.mp3`,cost:50,volume:0.45}));
