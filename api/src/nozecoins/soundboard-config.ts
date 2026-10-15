import {validateSoundCatalogue} from './soundboard.js';
export function soundboardFeatureEnabled(){return process.env.NOZECOINS_ENABLED==='true'&&process.env.NOZECOINS_SOUNDBOARD_ENABLED==='true';}
export function soundCatalogue(){
 if(!soundboardFeatureEnabled())return [];
 return validateSoundCatalogue(JSON.parse(process.env.NOZECOINS_SOUND_CATALOGUE||'[]'));
}
