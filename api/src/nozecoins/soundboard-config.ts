import {validateSoundCatalogue} from './soundboard.js';
import {DEFAULT_SOUND_CATALOGUE} from './sound-catalogue.js';
export function soundboardFeatureEnabled(){return process.env.NOZECOINS_ENABLED==='true'&&process.env.NOZECOINS_SOUNDBOARD_ENABLED==='true';}
export function soundCatalogue(){
 return validateSoundCatalogue(process.env.NOZECOINS_SOUND_CATALOGUE?JSON.parse(process.env.NOZECOINS_SOUND_CATALOGUE):DEFAULT_SOUND_CATALOGUE);
}
