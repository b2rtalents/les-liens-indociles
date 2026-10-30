/* LES LIENS INDOCILES — client bêta. Aucun secret serveur dans ce fichier. */
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = a => Array.isArray(a) ? a.join(', ') : '';
const split = a => [...new Set(String(a||'').split(/[,;\n]/).map(s=>s.trim()).filter(Boolean))].slice(0,35);
const intents = ['amitié','amour','entraide','sorties'];
const cfg = window.LLI_CONFIG || {};
const ok = /^https:\/\//.test(cfg.url||'') && !cfg.url.includes('VOTRE-') && cfg.publishableKey && !cfg.publishableKey.includes('VOTRE-');
const ui = {page:'accueil', list:[], active:null, media:null, connected:false, preview:false, canPreview:false, previewRequested:new URLSearchParams(location.search).get('apercu')==='1', currentRoom:null};
let sb, session, me, prefs, blocked = new Set(), refreshInterval;
const notice=(txt, target='#pageContent') => { const t=$(target);if(t)t.innerHTML=`<div class="notice">${esc(txt)}</div>`; };

// Optimisation locale : aucun original n'est envoyé avant traitement.
const mb = n => (n/1048576).toFixed(2)+' Mo';
async function optimizePhoto(file, maxEdge=1800){
 if(!file || !file.type.startsWith('image/')) return file;
 let bitmap;
 try{
  bitmap=await createImageBitmap(file);
  const scale=Math.min(1,maxEdge/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const context=canvas.getContext('2d');context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(bitmap,0,0,canvas.width,canvas.height);
  let blob=await new Promise(r=>canvas.toBlob(r,'image/webp',0.86));
  if(!blob||blob.type!=='image/webp')blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',0.88));
  if(!blob || blob.size>=file.size)return file;
  return new File([blob],file.name.replace(/\.[^.]+$/,'')+(blob.type==='image/webp'?'.webp':'.jpg'),{type:blob.type,lastModified:Date.now()});
 }catch(e){return file}
 finally{bitmap?.close?.()}
}
// Les enregistrements micro sont encodés avec un débit vocal réduit (Opus/AAC).
// Les formats MP3 / MP4 / WebM importés sont déjà compressés et restent inchangés.
// Les WAV importés sont réduits à du mono 16 kHz/16 bits, adapté à la parole.
async function optimizeVoice(file){
 if(!file || !/^(audio\/wav|audio\/wave|audio\/x-wav)$/.test(file.type))return file;
 try{
  const ctx=new (window.AudioContext||window.webkitAudioContext)();
  let decoded;
  try{decoded=await ctx.decodeAudioData(await file.arrayBuffer())}finally{await ctx.close()}
  const sampleRate=16000, samples=Math.ceil(decoded.duration*sampleRate);
  if(samples>60*sampleRate*5)return file;
  const offline=new OfflineAudioContext(1,samples,sampleRate),source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();
  const rendered=await offline.startRendering(),pcm=rendered.getChannelData(0),buf=new ArrayBuffer(44+samples*2),view=new DataView(buf);
  let index=0;const str=v=>{for(let i=0;i<v.length;i++)view.setUint8(index++,v.charCodeAt(i))};
  str('RIFF');view.setUint32(index,36+samples*2,true);index+=4;str('WAVEfmt ');view.setUint32(index,16,true);index+=4;
  view.setUint16(index,1,true);index+=2;view.setUint16(index,1,true);index+=2;view.setUint32(index,sampleRate,true);index+=4;
  view.setUint32(index,sampleRate*2,true);index+=4;view.setUint16(index,2,true);index+=2;view.setUint16(index,16,true);index+=2;
  str('data');view.setUint32(index,samples*2,true);index+=4;
  for(let i=0;i<samples;i++){const n=Math.max(-1,Math.min(1,pcm[i]||0));view.setInt16(index, n<0?n*32768:n*32767,true);index+=2}
  const candidate=new File([buf],file.name.replace(/\.[^.]+$/,'')+'-voix.wav',{type:'audio/wav'});
  return candidate.size<file.size?candidate:file;
 }catch(e){return file}
}
const prepareMedia=async(file)=> file?.type.startsWith('image/')?optimizePhoto(file):optimizeVoice(file);

// Aperçu visuel facultatif. Données entièrement fictives, stockées dans ce fichier.
// Jamais d'écriture, de blocage ou de messages vers Supabase pour ces profils.
const previewPeople = [{"id":"fictif-camille","nickname":"Camille","age":34,"birth_year":1992,"gender":"femme","city":"Nantes","goals":["amitié","sorties"],"interests":["Nature","Photographie","Balades"],"traits":["Authenticité","Écoute","Calme"],"bio":"Je collectionne les lieux tranquilles, les beaux ciels et les discussions qui prennent le temps.","ideal_weekend":"Je préfère les conversations sans précipitation.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-alexandre","nickname":"Alexandre","age":39,"birth_year":1987,"gender":"homme","city":"Angers","goals":["amour","amitié"],"interests":["Musique","Cuisine","Humour"],"traits":["Humour","Curiosité","Spontanéité"],"bio":"Curieux, amateur d’humour décalé et de conversations qui bifurquent joyeusement.","ideal_weekend":"On échange d’abord, et on voit où cela mène.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-lea","nickname":"Léa","age":31,"birth_year":1995,"gender":"femme","city":"Rennes","goals":["amitié","entraide"],"interests":["Lecture","Créativité","Balades"],"traits":["Créativité","Écoute","Curiosité"],"bio":"Une belle balade et une conversation vraie valent souvent mieux qu’une grande soirée.","ideal_weekend":"Je réponds parfois plus tard. Aucun souci si c’est pareil pour toi.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-sam","nickname":"Sam","age":42,"birth_year":1984,"gender":"non-binaire","city":"Saint-Nazaire","goals":["amour","sorties"],"interests":["Océan","Cinéma","Randonnées"],"traits":["Authenticité","Indépendance","Curiosité"],"bio":"La mer, le cinéma et les silences confortables : de quoi créer de jolis moments.","ideal_weekend":"Sans pression, toujours avec franchise.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-noa","nickname":"Noa","age":29,"birth_year":1997,"gender":"non-binaire","city":"Nantes","goals":["amitié","entraide","sorties"],"interests":["Animaux","Jardin","Jeux de société"],"traits":["Simplicité","Humour","Calme"],"bio":"Un jeu de société, des animaux et un jardin : mon trio gagnant.","ideal_weekend":"J’aime les petits groupes et les pauses.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-julie","nickname":"Julie","age":37,"birth_year":1989,"gender":"femme","city":"La Roche-sur-Yon","goals":["amour","amitié","sorties"],"interests":["Art","Chats","Nature"],"traits":["Curiosité","Authenticité","Calme"],"bio":"J’aime les expos discrètes, l’art et les découvertes qui ne sont pas prévues au programme.","ideal_weekend":"Une rencontre à la fois, sans relance insistante.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-thomas","nickname":"Thomas","age":48,"birth_year":1978,"gender":"homme","city":"Vannes","goals":["amitié","sorties"],"interests":["Pêche","Jardin","Randonnées"],"traits":["Calme","Simplicité","Écoute"],"bio":"La mer n’est jamais bien loin et je suis toujours partant pour une promenade.","ideal_weekend":"Une première balade me convient mieux qu’une foule.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-manon","nickname":"Manon","age":45,"birth_year":1981,"gender":"femme","city":"Cholet","goals":["amour","entraide"],"interests":["Lecture","Animaux","Musique"],"traits":["Écoute","Sensibilité","Authenticité"],"bio":"Des livres, un peu de musique et beaucoup d’attention aux petits détails.","ideal_weekend":"Doucement, mais avec sincérité.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-morgan","nickname":"Morgan","age":53,"birth_year":1973,"gender":"homme","city":"Saint-Brieuc","goals":["amour","amitié","sorties"],"interests":["Nature","Pêche","Cinéma"],"traits":["Authenticité","Calme","Sensibilité"],"bio":"Je préfère les échanges authentiques aux grands discours, et les promenades près de l’eau.","ideal_weekend":"La confiance d’abord, ensuite on prend le temps.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-eli","nickname":"Éli","age":26,"birth_year":2000,"gender":"non-binaire","city":"Lorient","goals":["entraide","amitié"],"interests":["Créativité","Art","Jeux de société"],"traits":["Créativité","Spontanéité","Curiosité"],"bio":"Je crée beaucoup, parfois dans tous les sens. Je cherche des liens simples et joyeux.","ideal_weekend":"Je n’aime pas les notifications pressantes.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-ines","nickname":"Inès","age":38,"birth_year":1988,"gender":"femme","city":"Nantes","goals":["amour","sorties"],"interests":["Danse","Philosophie","Musique","Humour","Nature"],"traits":["Extraversion","Audace","Humour","Passion"],"bio":"Danser, débattre jusqu’à minuit, rire très fort puis refaire le monde.","ideal_weekend":"J’aime les échanges électriques et les sorties improvisées.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-basile","nickname":"Basile","age":44,"birth_year":1982,"gender":"homme","city":"Rennes","goals":["amour","amitié"],"interests":["Sciences","Philosophie","Lecture","Voyages"],"traits":["Curiosité","Intensité","Écoute"],"bio":"Il y a toujours une histoire fascinante derrière une question banale.","ideal_weekend":"Passionné de discussions et de découvertes, je cherche de la complicité.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-zoe","nickname":"Zoé","age":35,"birth_year":1991,"gender":"femme","city":"Angers","goals":["amour","amitié","sorties"],"interests":["Jeux vidéo","Concerts","Animaux","Danse"],"traits":["Extraversion","Humour","Spontanéité"],"bio":"Concerts épiques, gaming et amitiés sans filtre : j’adore les connexions spontanées.","ideal_weekend":"Je peux parler toute la nuit de mes passions.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-maelle","nickname":"Maëlle","age":51,"birth_year":1975,"gender":"femme","city":"Vannes","goals":["amour","entraide"],"interests":["Jardin","Pêche","Lecture","Nature"],"traits":["Authenticité","Sensibilité","Curiosité"],"bio":"Entre mer et livres, je cherche une belle alchimie intellectuelle et humaine.","ideal_weekend":"J’aime la profondeur, avec de la liberté et de la joie.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-yanis","nickname":"Yanis","age":32,"birth_year":1994,"gender":"homme","city":"Saint-Nazaire","goals":["amour","sorties","amitié"],"interests":["Randonnées","Sport collectif","Musique","Cuisine"],"traits":["Extraversion","Sociabilité","Passion"],"bio":"Je parle facilement à tout le monde, mais je cherche surtout du vrai.","ideal_weekend":"Des projets, des concerts et beaucoup d’énergie.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-lou","nickname":"Lou","age":30,"birth_year":1996,"gender":"non-binaire","city":"Nantes","goals":["amour","amitié"],"interests":["Photographie","Art","Théâtre","Manga"],"traits":["Créativité","Indépendance","Humour"],"bio":"La scène, l’image et les rencontres spontanées font battre mon cœur.","ideal_weekend":"J’aime les personnes libres et les conversations sans cadres.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-clara","nickname":"Clara","age":28,"birth_year":1998,"gender":"femme","city":"Lille","goals":["amitié","sorties"],"interests":["Concerts","Danse","Photographie","Voyages"],"traits":["Spontanéité","Humour","Sociabilité"],"bio":"Toujours partante pour un concert improvisé et une virée photo à plusieurs.","ideal_weekend":"J'avance à mon rythme, sans pression.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-mehdi","nickname":"Mehdi","age":33,"birth_year":1993,"gender":"homme","city":"Bordeaux","goals":["amour","sorties"],"interests":["Cuisine du monde","Voyages","Musique","Philosophie"],"traits":["Ouverture d’esprit","Audace","Curiosité"],"bio":"Une table joyeuse, une destination surprise et de vraies discussions.","ideal_weekend":"J'aime la spontanéité, mais sans obligation de réponse.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-jade","nickname":"Jade","age":24,"birth_year":2002,"gender":"femme","city":"Nantes","goals":["amour","amitié"],"interests":["BD","Gaming","Jeux vidéo","Animaux"],"traits":["Imagination","Humour","Sensibilité"],"bio":"Je préfère un marathon de jeux coopératifs à un marathon mondain.","ideal_weekend":"Une rencontre à la fois me convient.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-raphael","nickname":"Raphaël","age":62,"birth_year":1964,"gender":"homme","city":"Angers","goals":["amour","entraide"],"interests":["Histoire","Jardin","Pêche","Lecture"],"traits":["Écoute","Loyauté","Calme"],"bio":"Des histoires à raconter, des semis à partager et l’envie d’une nouvelle complicité.","ideal_weekend":"Les échanges sincères comptent plus que la fréquence des messages.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-iris","nickname":"Iris","age":23,"birth_year":2003,"gender":"non-binaire","city":"Rennes","goals":["amitié","sorties"],"interests":["Manga","Théâtre","Art","Improvisation"],"traits":["Créativité","Enthousiasme","Extraversion"],"bio":"Impro, illustrations et projets un peu fous : mes idées arrivent en grappes.","ideal_weekend":"J'avance à mon rythme, sans pression.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-nour","nickname":"Nour","age":47,"birth_year":1979,"gender":"femme","city":"Toulouse","goals":["amour","amitié"],"interests":["Sciences","Philosophie","Podcasts","Gastronomie"],"traits":["Esprit critique","Passion","Écoute"],"bio":"J’aime les conversations qui creusent et les repas qui durent.","ideal_weekend":"J'aime la spontanéité, mais sans obligation de réponse.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-gabriel","nickname":"Gabriel","age":58,"birth_year":1968,"gender":"homme","city":"Quimper","goals":["amour","sorties"],"interests":["Bateaux","Océan","Photographie","Nature"],"traits":["Authenticité","Calme","Tendresse"],"bio":"Je photographie les bateaux, mais ce sont les gens que j’ai envie de découvrir.","ideal_weekend":"Une rencontre à la fois me convient.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-aicha","nickname":"Aïcha","age":41,"birth_year":1985,"gender":"femme","city":"Lyon","goals":["amour","entraide","sorties"],"interests":["Bénévolat","Danse","Cuisine du monde","Psychologie"],"traits":["Empathie","Sociabilité","Intensité"],"bio":"J’adore les pistes de danse, l’entraide concrète et l’honnêteté sans détour.","ideal_weekend":"Les échanges sincères comptent plus que la fréquence des messages.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-sacha","nickname":"Sacha","age":36,"birth_year":1990,"gender":"non-binaire","city":"Caen","goals":["amour","amitié"],"interests":["Écriture","Poésie","Cinéma","Podcasts"],"traits":["Sensibilité","Imagination","Authenticité"],"bio":"Une histoire bien racontée et un silence sans gêne me séduisent pareillement.","ideal_weekend":"J'avance à mon rythme, sans pression.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-hugo","nickname":"Hugo","age":20,"birth_year":2006,"gender":"homme","city":"Le Mans","goals":["amitié","sorties"],"interests":["Gaming","Jeux vidéo","Sport collectif","Concerts"],"traits":["Humour","Extraversion","Spontanéité"],"bio":"Je cherche une équipe pour jouer, bouger et rire sans obligation de performance.","ideal_weekend":"J'aime la spontanéité, mais sans obligation de réponse.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-celeste","nickname":"Céleste","age":67,"birth_year":1959,"gender":"femme","city":"Vannes","goals":["amour","entraide"],"interests":["Jardin","Nature","Lecture","Bricolage"],"traits":["Tendresse","Simplicité","Loyauté"],"bio":"J’aime les conversations douces, les légumes du potager et les gestes attentionnés.","ideal_weekend":"Une rencontre à la fois me convient.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-oscar","nickname":"Oscar","age":50,"birth_year":1976,"gender":"homme","city":"Brest","goals":["amour","sorties","amitié"],"interests":["Bateaux","Pêche","Histoire","Randonnées"],"traits":["Audace","Loyauté","Curiosité"],"bio":"Je peux partir à l’aube en bateau et passer la soirée à refaire le monde.","ideal_weekend":"Les échanges sincères comptent plus que la fréquence des messages.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-romy","nickname":"Romy","age":36,"birth_year":1990,"gender":"femme","city":"Marseille","goals":["amour","sorties"],"interests":["Danse","Festival","Voyages insolites","Photographie"],"traits":["Extraversion","Esprit d’aventure","Audace"],"bio":"Soleil, danse et aventures spontanées : je veux des souvenirs, pas un programme.","ideal_weekend":"J'avance à mon rythme, sans pression.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-elio","nickname":"Elio","age":43,"birth_year":1983,"gender":"non-binaire","city":"Grenoble","goals":["amitié","entraide"],"interests":["Escalade","Vélo","Sciences","Méditation"],"traits":["Indépendance","Écoute","Curiosité"],"bio":"Entre une paroi, un livre de sciences et du calme, je cherche des liens souples.","ideal_weekend":"J'aime la spontanéité, mais sans obligation de réponse.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-margot","nickname":"Margot","age":55,"birth_year":1971,"gender":"femme","city":"Saint-Brieuc","goals":["amour","sorties"],"interests":["Jardin","Pêche","Balades","Cuisine"],"traits":["Humour","Authenticité","Calme"],"bio":"Un potager, des amis autour d’une table et la mer pas loin : mon bonheur simple.","ideal_weekend":"Une rencontre à la fois me convient.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-karim","nickname":"Karim","age":45,"birth_year":1981,"gender":"homme","city":"La Rochelle","goals":["amour","amitié"],"interests":["Gastronomie","Photographie","Voyages","Musique"],"traits":["Ouverture d’esprit","Sensibilité","Sociabilité"],"bio":"Je cherche autant une complicité à table qu’une vraie curiosité mutuelle.","ideal_weekend":"Les échanges sincères comptent plus que la fréquence des messages.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-anais","nickname":"Anaïs","age":32,"birth_year":1994,"gender":"femme","city":"Nantes","goals":["amitié","entraide"],"interests":["Animaux","Yoga","Psychologie","Jardinage"],"traits":["Empathie","Calme","Écoute"],"bio":"Les longues conversations apaisées et les promenades avec mon chien me ressourcent.","ideal_weekend":"J'avance à mon rythme, sans pression.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-felix","nickname":"Félix","age":29,"birth_year":1997,"gender":"homme","city":"Tours","goals":["amour","sorties"],"interests":["Improvisation","Théâtre","Musique","Cuisine"],"traits":["Humour","Créativité","Sociabilité"],"bio":"Mon humour s’emballe un peu ; je sais aussi écouter sérieusement.","ideal_weekend":"J'aime la spontanéité, mais sans obligation de réponse.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-alba","nickname":"Alba","age":27,"birth_year":1999,"gender":"non-binaire","city":"Strasbourg","goals":["amour","sorties","amitié"],"interests":["Art","Manga","Voyages","Danse"],"traits":["Créativité","Spontanéité","Ouverture d’esprit"],"bio":"Une expo le matin, une ville inconnue le soir : j’adore sortir des sentiers battus.","ideal_weekend":"Une rencontre à la fois me convient.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-pauline","nickname":"Pauline","age":73,"birth_year":1953,"gender":"femme","city":"Cholet","goals":["amitié","entraide"],"interests":["Jardinage","Lecture","Bénévolat","Cuisine"],"traits":["Écoute","Loyauté","Tendresse"],"bio":"Toujours curieuse des autres générations, je partage volontiers recettes et idées.","ideal_weekend":"Les échanges sincères comptent plus que la fréquence des messages.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-arnaud","nickname":"Arnaud","age":38,"birth_year":1988,"gender":"homme","city":"Saint-Nazaire","goals":["amitié","sorties"],"interests":["Bricolage","Bateaux","Sport collectif","Concerts"],"traits":["Simplicité","Humour","Sociabilité"],"bio":"Un outil dans une main, un billet de concert dans l’autre : partant pour les deux.","ideal_weekend":"J'avance à mon rythme, sans pression.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-victoire","nickname":"Victoire","age":53,"birth_year":1973,"gender":"femme","city":"Montpellier","goals":["amour","amitié","entraide"],"interests":["Philosophie","Sciences","Yoga","Écriture"],"traits":["Esprit critique","Empathie","Indépendance"],"bio":"Je préfère être stimulée par une idée que séduite par un slogan.","ideal_weekend":"J'aime la spontanéité, mais sans obligation de réponse.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-mael","nickname":"Maël","age":35,"birth_year":1991,"gender":"homme","city":"Lorient","goals":["amour","entraide"],"interests":["Océan","Pêche","Méditation","Cuisine"],"traits":["Sensibilité","Authenticité","Calme"],"bio":"Mes meilleures conversations commencent souvent après une balade en bord de mer.","ideal_weekend":"Une rencontre à la fois me convient.","visible":true,"fictif":true,"distance_km":null},{"id":"fictif-charlie","nickname":"Charlie","age":60,"birth_year":1966,"gender":"non-binaire","city":"Paris","goals":["amour","amitié"],"interests":["Théâtre","Art","Philosophie","Musique"],"traits":["Franc-parler","Curiosité","Tendresse"],"bio":"Je crois aux rencontres tardives, aux discussions vives et aux bonnes surprises.","ideal_weekend":"Les échanges sincères comptent plus que la fréquence des messages.","visible":true,"fictif":true,"distance_km":null}];
const previewCoords = {"Nantes":[47.218,-1.553],"Angers":[47.478,-0.563],"Rennes":[48.117,-1.678],"Saint-Nazaire":[47.273,-2.214],"La Roche-sur-Yon":[46.671,-1.426],"Vannes":[47.658,-2.759],"Cholet":[47.06,-0.88],"Saint-Brieuc":[48.514,-2.761],"Lorient":[47.748,-3.37],"Lille":[50.63,3.057],"Bordeaux":[44.838,-0.58],"Toulouse":[43.604,1.444],"Quimper":[47.996,-4.102],"Lyon":[45.764,4.836],"Caen":[49.183,-0.37],"Le Mans":[48.007,0.199],"Brest":[48.39,-4.486],"Marseille":[43.296,5.369],"Grenoble":[45.188,5.724],"La Rochelle":[46.16,-1.151],"Tours":[47.394,0.684],"Strasbourg":[48.573,7.752],"Montpellier":[43.611,3.876],"Paris":[48.856,2.352]};
function previewDistance(city){
 const here=(me?.latitude!=null&&me?.longitude!=null)?[Number(me.latitude),Number(me.longitude)]:previewCoords[(me?.city||'').trim()],there=previewCoords[city];
 if(!here||!there)return null;
 const r=Math.PI/180,dlat=(there[0]-here[0])*r,dlon=(there[1]-here[1])*r;
 const a=Math.sin(dlat/2)**2+Math.cos(here[0]*r)*Math.cos(there[0]*r)*Math.sin(dlon/2)**2;
 return Math.round(6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)));
}
const normWord=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
function previewFind({intent,gender,min,max,km}){
 const ownInterests=new Set((me?.interests||[]).map(normWord));
 const ownTraits=new Set((me?.traits||[]).map(normWord));
 return previewPeople.filter(p=>{
   const d=previewDistance(p.city);
   if((intent&&!p.goals.includes(intent))||gender&&p.gender!==gender||p.age<min||p.age>max)return false;
   if(km && (d===null||d>km))return false;
   if(intent==='amour'){
     // Filtre du côté de la personne connectée; réciprocité serveur réservée aux vrais membres.
     if(prefs?.seeking_genders?.length&&!prefs.seeking_genders.includes(p.gender))return false;
   }
   return true;
 }).map(p=>({...p,distance_km:previewDistance(p.city),_score:p.interests.filter(x=>ownInterests.has(normWord(x))).length*2+p.traits.filter(x=>ownTraits.has(normWord(x))).length}))
 .sort((a,b)=>b._score-a._score||a.nickname.localeCompare(b.nickname,'fr'));
}
function previewFlag(){return '<span class="pill" style="background:#fff0d1;color:#653e06">PROFIL FICTIF</span>'}
function renderPreviewChat(p){
 $('#pageContent').innerHTML=`<div class="contenttop"><div><h2>Messagerie — aperçu</h2><p>Conversation fictive en lecture seule. Aucune donnée transmise et aucun message envoyé.</p></div><button class="secondary" id="returnExplore">← Retour aux profils</button></div>
 <div class="panel" style="max-width:750px"><h3>${esc(p.nickname)} · ${esc(p.city)}</h3><div class="chatlog"><div class="bubble"><div>Bonjour ! J’ai vu que nous partagions quelques centres d’intérêt.</div><small>Exemple fictif</small></div><div class="bubble mine"><div>Oui, ${esc(p.interests[0]||'les sorties')} ! Ça donne envie d’échanger.</div><small>Exemple fictif</small></div><div class="bubble"><div>Avec plaisir. Prenons le temps de faire connaissance.</div><small>Exemple fictif</small></div></div>
 <p class="hint">Dans une vraie conversation, cette zone permet les messages texte, les photos et les vocaux.</p>
 <div class="chatcompose"><textarea disabled placeholder="Envoi désactivé dans l’aperçu"></textarea><button disabled class="secondary">Photo / vocal</button><button disabled class="primary">Envoyer</button></div></div>`;
 $('#returnExplore').onclick=()=>page('explorer');
}

const alertAuth=txt=>{$('#authMessage').textContent=txt};
const setSection=id=>{for(const n of ['publicHome','authPanel','app','setup'])$('#'+n).hidden=n!==id;if(id!=='app')document.body.dataset.space=id==='authPanel'?'connexion':'public';};
const ageOf=p=>p.birth_year ? new Date().getFullYear()-p.birth_year : null;
const isAdult=p=>p.birth_year && ageOf(p)>=18;
const mediaUrl=async(bucket,path)=>{if(!path)return null; const {data,error}=await sb.storage.from(bucket).createSignedUrl(path,600);return error?null:data.signedUrl;};
async function init(){
 // Pas d'ouverture automatique via un lien contenant une session : mot de passe requis.
 try {
  const current=new URL(location.href);
  const sensitive=['code','access_token','refresh_token','error','error_description'];
  let cleaned=false;
  for(const key of sensitive){if(current.searchParams.has(key)){current.searchParams.delete(key);cleaned=true;}}
  if(/(?:^#|[&#])(?:access_token|refresh_token|error)=/.test(current.hash)){current.hash='';cleaned=true;}
  if(cleaned)history.replaceState(null,'',current.pathname+current.search+current.hash);
 }catch(_){}
 setSection('publicHome');$('#logoutBtn').hidden=true;$('#userBadge').textContent='';
 const openAuth=(mode)=>{setSection('authPanel');$('#authTitle').textContent=mode==='signup'?'Créer mon compte':'Me connecter';$('#signUpBtn').classList.toggle('primary',mode==='signup');$('#signUpBtn').classList.toggle('secondary',mode!=='signup');$('#signInBtn').classList.toggle('primary',mode!=='signup');$('#signInBtn').classList.toggle('secondary',mode==='signup');$('#authPassword').value='';$('#agreeRules').checked=false;$('#signupConsentWrap').style.display=mode==='signup'?'block':'none';alertAuth('');$('#authEmail').focus();};
 $('#loginOpen').onclick=()=>openAuth('login');$('#signupOpen').onclick=()=>openAuth('signup');$('#backHome').onclick=()=>setSection('publicHome');
 $('#calmBtn').onclick=()=>{document.body.classList.toggle('calm');$('#calmBtn').setAttribute('aria-pressed',String(document.body.classList.contains('calm')))};
 $('#signInBtn').onclick=()=>auth(false);$('#signUpBtn').onclick=()=>auth(true);
 $('#logoutBtn').onclick=async()=>{await sb.auth.signOut();location.reload()};
 $('#closeModal').onclick=()=>$('#modal').hidden=true;
 $('#modal').onclick=e=>{if(e.target.id==='modal')$('#modal').hidden=true};
 document.querySelectorAll('.tabs [data-page]').forEach(el=>el.onclick=()=>page(el.dataset.page));
 if(!ok){setSection('publicHome');$('#loginOpen').disabled=true;$('#signupOpen').disabled=true;$('#availabilityInfo').textContent='Les inscriptions ouvriront prochainement. Aucun compte ne peut encore être créé.';return}
 try{
   // Supabase JS v2, import explicite, depuis un CDN HTTPS réputé.
   const mod=await import('https://esm.sh/@supabase/supabase-js@2.57.4');
   try {const ref=new URL(cfg.url).hostname.split('.')[0];localStorage.removeItem(`sb-${ref}-auth-token`);}catch(_){}
   // Connexion explicite à chaque ouverture : session limitée à la page, jamais restaurée depuis le navigateur.
   sb=mod.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:false,autoRefreshToken:true,detectSessionInUrl:false}});
   session=null;ui.connected=false;ui.canPreview=false;ui.preview=false;
   sb.auth.onAuthStateChange((event)=>{ if(event==='SIGNED_OUT'){session=null;ui.connected=false;ui.canPreview=false;ui.preview=false;$('#logoutBtn').hidden=true;$('#userBadge').textContent='';setSection('publicHome')} });
   setSection('publicHome');
 }catch(e){setSection('publicHome');$('#loginOpen').disabled=true;$('#signupOpen').disabled=true;$('#availabilityInfo').textContent='Les inscriptions sont temporairement indisponibles. Réessaie ultérieurement.';}
}
async function auth(signup){
 const email=$('#authEmail').value.trim().toLowerCase(),password=$('#authPassword').value;
 if(!email.includes('@')||!password|| (signup&&password.length<10)){alertAuth(signup?'Indique une adresse e-mail et un mot de passe d’au moins 10 caractères.':'Indique ton adresse e-mail et ton mot de passe.');return}
 if(signup&&!$('#agreeRules').checked){alertAuth('Prends connaissance des règles et confirme les avoir lues avant de créer ton compte.');return}
 alertAuth('Connexion en cours…');
 const {data,error}=signup ? await sb.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}}) : await sb.auth.signInWithPassword({email,password});
 $('#authPassword').value=''; // Ne pas conserver le mot de passe en mémoire dans le champ.
 if(error){alertAuth('Opération impossible : '+error.message);return}
 if(signup && !data.session){alertAuth('Si ton adresse est invitée, vérifie le courriel de confirmation avant de te connecter.');return}
 session=data.session;await enter();
}
async function enter(){
 const {data:{user},error}=await sb.auth.getUser();if(error||!user){setSection('authPanel');return}
 const [{data:profile,error:e1},{data:pr},{data:bl},{data:consent}]=await Promise.all([
 sb.rpc('lli_get_my_profile'),
 sb.from('private_preferences').select('*').eq('user_id',user.id).maybeSingle(),
 sb.from('blocks').select('blocked_id').eq('blocker_id',user.id),
 sb.from('lli_privacy_consents').select('romantic_preferences,notice_version').eq('user_id',user.id).maybeSingle()
 ]);
 if(e1||!profile){setSection('authPanel');alertAuth(e1?'Le chargement sécurisé du profil a échoué. Réessaie après avoir actualisé la page.':'Le compte existe, mais son profil est absent. Contacte l’administrateur.');return}
 me=profile;prefs=pr||{};prefs.romantic_consent=consent?.romantic_preferences===true;blocked=new Set((bl||[]).map(x=>x.blocked_id));ui.connected=true;
  // Le serveur décide du statut administrateur ; l'URL seule ne donne aucun droit.
  try {const {data,error:adminError}=await sb.rpc('lli_is_preview_admin');ui.canPreview=!adminError&&data===true;}
  catch(_){ui.canPreview=false;}
  ui.preview=ui.canPreview&&ui.previewRequested;
 $('#userBadge').textContent=me.nickname;$('#logoutBtn').hidden=false;
 setSection('app');await page(ui.preview?'explorer':'accueil');
}
function page(name){
  ui.page=name;document.body.dataset.space=name;if(name!=='salons')ui.currentRoom=null;
  document.querySelectorAll('.tabs [data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===name));
  if(name==='accueil')renderHome();
  else if(name==='profil')renderProfile();
  else if(name==='explorer')renderExplorer();
  else if(name==='messages')renderMessages();
  else if(name==='forums')renderForums();
  else if(name==='salons')renderSalons();
  else if(name==='sorties')renderSorties();
  else if(name==='securite')renderSecurity();
} 
const checks=(values,selected)=>values.map(v=>`<label><input type="checkbox" value="${esc(v)}" ${selected?.includes(v)?'checked':''}> ${esc(v)}</label>`).join('');
/* Communauté : salons, forums et sorties. Ce code fait partie intégrante de l'application.
   Aucune donnée de démonstration ne sera créée dans Supabase. */
const communityDate = value => value ? new Date(value).toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'}) : '';
const communityDateTime = value => new Date(value).toLocaleString('fr-FR',{dateStyle:'medium',timeStyle:'short'});
const canCommunity = () => isAdult(me);
const communityReady = (container='#pageContent') => {
 if(!canCommunity()) {notice('Les espaces communautaires sont réservés aux membres majeurs. Renseigne d’abord ton année de naissance dans Mon profil.',container);return false}
 return true;
};
const communityFailure=(e)=> e?.code==='42P01' || /does not exist|schema cache|could not find the table/i.test(e?.message||'')
 ? 'La base communautaire n’est pas encore initialisée. Le script SQL 02_communaute.sql doit être exécuté avant l’ouverture des modules.'
 : 'Opération indisponible : '+(e?.message||'erreur inconnue');
const communityAuthor = async (ids) => {
 const distinct=[...new Set(ids.filter(Boolean))];const names=new Map();
 if(!distinct.length)return names;
 const {data}=await sb.from('profiles').select('id,nickname').in('id',distinct.slice(0,150));
 for(const p of data||[])names.set(p.id,p.nickname);
 return names;
};
function communityStart(title,subtitle){
 $('#pageContent').innerHTML=`<div class="contenttop"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div></div><div id="communityBody" aria-live="polite"></div>`;
 return $('#communityBody');
}
async function renderHome(){
 const root=communityStart('Bienvenue dans le cercle','Des espaces pour se rencontrer à son rythme, sans étiquette ni obligation de se dévoiler.');
 root.innerHTML=`<div class="welcome panel"><div><span class="eyebrow">TON ESPACE PRIVÉ</span><h3>Bonjour, ${esc(me?.nickname||'')}</h3><p>Tu choisis où participer et quand répondre. Les publications sont visibles uniquement par les membres connectés et majeurs.</p></div><div class="welcome-mark" aria-hidden="true">✳</div></div>
 <div class="hub-grid">
  <article class="hub-card"><span class="hub-symbol">◎</span><h3>Découvrir</h3><p>Rencontres et affinités, à ton rythme.</p><button class="secondary" data-go="explorer">Voir les profils</button></article>
  <article class="hub-card"><span class="hub-symbol">☷</span><h3>Forums</h3><p>Partager une idée, lancer une discussion ou demander conseil.</p><button class="secondary" data-go="forums">Explorer les sujets</button></article>
  <article class="hub-card"><span class="hub-symbol">◉</span><h3>Salons</h3><p>Discuter librement dans des espaces thématiques.</p><button class="secondary" data-go="salons">Entrer dans les salons</button></article>
  <article class="hub-card"><span class="hub-symbol">⌖</span><h3>Sorties</h3><p>Proposer un moment simple ou rejoindre une activité.</p><button class="secondary" data-go="sorties">Découvrir les sorties</button></article>
  <article class="hub-card"><span class="hub-symbol">♡</span><h3>Messages privés</h3><p>Un échange individuel et discret.</p><button class="secondary" data-go="messages">Mes conversations</button></article>
  <article class="hub-card"><span class="hub-symbol">☾</span><h3>Mon rythme</h3><p>Active le mode calme en haut de la page et garde le contrôle de tes informations.</p><button class="secondary" data-go="profil">Mes préférences</button></article>
 </div><div class="panel community-guidance"><h3>La règle du cercle</h3><p>Respect des rythmes, confidentialité, absence de pression et aucune obligation de déclarer un diagnostic. Tu peux bloquer ou signaler un comportement abusif.</p></div>`;
 root.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>page(b.dataset.go));
}
async function renderForums(){
 const root=communityStart('Forums communautaires','Des conversations asynchrones : lis, participe ou reviens plus tard.');
 if(!communityReady('#communityBody'))return;
 root.innerHTML=`<div class="community-actions"><button id="newTopic" class="primary">+ Nouveau sujet</button><button id="reloadTopics" class="secondary">Actualiser</button></div><div id="forumList" class="community-list"><p class="hint">Chargement des sujets…</p></div>`;
 $('#newTopic').onclick=showTopicForm;$('#reloadTopics').onclick=loadTopics;
 await loadTopics();
}
async function loadTopics(){
 const target=$('#forumList');if(!target||ui.page!=='forums')return;
 target.innerHTML='<p class="hint">Chargement…</p>';
 const {data,error}=await sb.from('community_topics').select('id,author_id,category,title,body,created_at').order('created_at',{ascending:false}).limit(100);
 if(!$('#forumList')||ui.page!=='forums')return;
 if(error){target.innerHTML=`<div class="warn">${esc(communityFailure(error))}</div>`;return}
 if(!data?.length){target.innerHTML='<div class="panel empty-state">Aucun sujet pour le moment. Tu peux lancer la première conversation.</div>';return}
 const names=await communityAuthor(data.map(x=>x.author_id));if(ui.page!=='forums'||!$('#forumList'))return;
 target.innerHTML='';for(const t of data){
  const card=document.createElement('article');card.className='community-entry';
  card.innerHTML=`<div class="entry-meta"><span class="pill">${esc(t.category)}</span><span>${esc(communityDate(t.created_at))}</span></div><h3>${esc(t.title)}</h3><p>${esc(t.body.slice(0,220))}${t.body.length>220?'…':''}</p><div class="entry-foot"><span>${esc(names.get(t.author_id)||'Membre')}</span><button class="secondary">Lire et répondre</button></div>`;
  card.querySelector('button').onclick=()=>showTopic(t);target.append(card);
 }
}
function showTopicForm(){
 const target=$('#forumList');if(!target)return;
 target.innerHTML=`<form id="newTopicForm" class="panel stack"><h3>Ouvrir une discussion</h3>
 <label>Rubrique<select name="category"><option>Rencontres</option><option>Entraide</option><option>Passions</option><option>Vie du cercle</option></select></label>
 <label>Titre<input name="title" maxlength="120" minlength="5" required placeholder="De quoi aimerais-tu parler ?"></label>
 <label>Ton message<textarea name="body" maxlength="2500" minlength="10" required placeholder="Chacun participe à son rythme."></textarea></label>
 <div class="actions"><button class="primary" type="submit">Publier le sujet</button><button type="button" class="secondary" id="cancelNewTopic">Annuler</button></div><p id="topicFormStatus" class="feedback"></p></form>`;
 $('#cancelNewTopic').onclick=loadTopics;$('#newTopicForm').onsubmit=async e=>{
  e.preventDefault();const form=e.currentTarget,b=form.elements;
  const {error}=await sb.from('community_topics').insert({author_id:me.id,category:b.category.value,title:b.title.value.trim(),body:b.body.value.trim()});
  if(error){$('#topicFormStatus').textContent=communityFailure(error);return}await loadTopics();
 };
}
async function showTopic(topic){
 const root=communityStart(topic.title,'Forum · '+topic.category);
 if(!communityReady('#communityBody'))return;
 root.innerHTML=`<div class="community-actions"><button class="secondary" id="backToTopics">← Tous les sujets</button></div>
 <article class="panel stack"><div class="entry-meta">Publié le ${esc(communityDate(topic.created_at))}</div><p class="preserve-lines">${esc(topic.body)}</p><div class="actions" id="topicTools"></div></article>
 <h3 class="sectiontitle">Réponses</h3><div id="topicReplies" class="community-list">Chargement…</div>
 <form id="replyForm" class="panel stack"><label>Ta réponse<textarea name="body" maxlength="2000" required placeholder="Répondre avec respect…"></textarea></label><div class="actions"><button class="primary">Publier ma réponse</button></div><p class="feedback" id="replyStatus"></p></form>`;
 $('#backToTopics').onclick=()=>page('forums');
 if(topic.author_id===me.id){const del=document.createElement('button');del.textContent='Supprimer mon sujet';del.className='quiet';del.onclick=async()=>{
  if(!confirm('Supprimer ce sujet et toutes ses réponses ?'))return;
  const {error}=await sb.from('community_topics').delete().eq('id',topic.id);
  if(error){alert(communityFailure(error));return}page('forums');
 };$('#topicTools').append(del)}else{const reportBtn=document.createElement('button');reportBtn.className='quiet';reportBtn.textContent='Signaler le sujet';reportBtn.onclick=()=>report(topic.author_id);$('#topicTools').append(reportBtn)}
 $('#replyForm').onsubmit=async e=>{
  e.preventDefault();const f=e.currentTarget;const body=f.elements.body.value.trim();if(!body)return;
  const {error}=await sb.from('community_replies').insert({topic_id:topic.id,author_id:me.id,body});
  if(error){$('#replyStatus').textContent=communityFailure(error);return}f.reset();await loadReplies(topic);
 };
 await loadReplies(topic);
}
async function loadReplies(topic){
 const target=$('#topicReplies');if(!target)return;
 const {data,error}=await sb.from('community_replies').select('id,topic_id,author_id,body,created_at').eq('topic_id',topic.id).order('created_at',{ascending:true}).limit(150);
 if(!$('#topicReplies'))return;
 if(error){target.textContent=communityFailure(error);return}
 if(!data?.length){target.innerHTML='<div class="empty-state">Aucune réponse pour le moment.</div>';return}
 const names=await communityAuthor(data.map(x=>x.author_id));if(!$('#topicReplies'))return;target.innerHTML='';
 for(const reply of data){const card=document.createElement('article');card.className='community-entry';
  card.innerHTML=`<div class="entry-meta">${esc(names.get(reply.author_id)||'Membre')} · ${esc(communityDate(reply.created_at))}</div><p class="preserve-lines">${esc(reply.body)}</p><div class="entry-foot" data-actions></div>`;
  const act=card.querySelector('[data-actions]');
  if(reply.author_id===me.id){const remove=document.createElement('button');remove.className='quiet';remove.textContent='Supprimer';remove.onclick=async()=>{
   if(!confirm('Supprimer cette réponse ?'))return;const {error}=await sb.from('community_replies').delete().eq('id',reply.id);
   if(error)alert(communityFailure(error));else loadReplies(topic);
  };act.append(remove)}else{const reportBtn=document.createElement('button');reportBtn.className='quiet';reportBtn.textContent='Signaler';reportBtn.onclick=()=>report(reply.author_id);act.append(reportBtn)}
  target.append(card);
 }
}
async function renderSalons(){
 const root=communityStart('Salons de discussion','Des espaces thématiques où chacun échange à son rythme. Actualise pour voir les derniers messages.');
 if(!communityReady('#communityBody'))return;
 root.innerHTML='<div id="salonsList" class="hub-grid"><p class="hint">Chargement des salons…</p></div>';
 const {data,error}=await sb.from('community_rooms').select('id,slug,title,description').order('title');
 const target=$('#salonsList');if(!target||ui.page!=='salons')return;
 if(error){target.innerHTML=`<div class="warn">${esc(communityFailure(error))}</div>`;return}
 target.innerHTML='';for(const room of data||[]){const c=document.createElement('article');c.className='hub-card';
  c.innerHTML=`<span class="hub-symbol">◉</span><h3>${esc(room.title)}</h3><p>${esc(room.description)}</p><button class="secondary">Entrer dans le salon</button>`;
  c.querySelector('button').onclick=()=>showRoom(room);target.append(c)}
 if(!data?.length)target.textContent='Aucun salon disponible.';
}
async function showRoom(room){
 ui.currentRoom=room.id;
 const root=communityStart(room.title,room.description);
 root.innerHTML=`<div class="community-actions"><button id="backRooms" class="secondary">← Tous les salons</button><button id="refreshRoom" class="secondary">Actualiser les messages</button></div>
 <div id="roomFeed" class="community-list" aria-live="polite">Chargement…</div>
 <form id="roomForm" class="panel stack"><label>Ton message<textarea name="body" maxlength="1200" required placeholder="Écris à ton rythme…"></textarea></label><button class="primary" type="submit">Envoyer au salon</button><p id="roomStatus" class="feedback"></p></form>`;
 $('#backRooms').onclick=()=>{ui.currentRoom=null;page('salons')};
 $('#refreshRoom').onclick=()=>loadRoomMessages(room);
 $('#roomForm').onsubmit=async e=>{
  e.preventDefault();const form=e.currentTarget,body=form.elements.body.value.trim();if(!body)return;
  const {error}=await sb.from('community_room_messages').insert({room_id:room.id,author_id:me.id,body});
  if(error){$('#roomStatus').textContent=communityFailure(error);return}form.reset();$('#roomStatus').textContent='Message publié.';await loadRoomMessages(room);
 };
 await loadRoomMessages(room);
}
async function loadRoomMessages(room){
 const target=$('#roomFeed');if(!target||ui.currentRoom!==room.id)return;
 const {data,error}=await sb.from('community_room_messages').select('id,author_id,body,created_at').eq('room_id',room.id).order('created_at',{ascending:false}).limit(80);
 if(!$('#roomFeed')||ui.currentRoom!==room.id)return;
 if(error){target.textContent=communityFailure(error);return}
 if(!data?.length){target.innerHTML='<div class="empty-state">Le salon est calme pour le moment. Tu peux envoyer un premier message.</div>';return}
 const names=await communityAuthor(data.map(x=>x.author_id));if(!$('#roomFeed')||ui.currentRoom!==room.id)return;target.innerHTML='';
 for(const m of [...data].reverse()){
  const card=document.createElement('article');card.className='community-entry';
  card.innerHTML=`<div class="entry-meta">${esc(names.get(m.author_id)||'Membre')} · ${esc(communityDate(m.created_at))}</div><p class="preserve-lines">${esc(m.body)}</p><div class="entry-foot" data-actions></div>`;
  const act=card.querySelector('[data-actions]');
  if(m.author_id===me.id){const remove=document.createElement('button');remove.className='quiet';remove.textContent='Supprimer';remove.onclick=async()=>{
   if(!confirm('Supprimer ton message ?'))return;const {error}=await sb.from('community_room_messages').delete().eq('id',m.id);
   if(error)alert(communityFailure(error));else loadRoomMessages(room);
  };act.append(remove)}else{const r=document.createElement('button');r.className='quiet';r.textContent='Signaler';r.onclick=()=>report(m.author_id);act.append(r)}
  target.append(card);
 }
}
async function renderSorties(){
 const root=communityStart('Sorties et rencontres','Une promenade, un café, une activité : propose un moment sans pression.');
 if(!communityReady('#communityBody'))return;
 root.innerHTML=`<div class="community-actions"><button class="primary" id="newEvent">+ Proposer une sortie</button><button class="secondary" id="refreshEvents">Actualiser</button></div><div id="eventList" class="community-list">Chargement…</div>`;
 $('#newEvent').onclick=showEventForm;$('#refreshEvents').onclick=loadEvents;
 await loadEvents();
}
async function loadEvents(){
 const root=$('#eventList');if(!root||ui.page!=='sorties')return;
 const {data,error}=await sb.from('community_events').select('id,creator_id,title,description,city,meeting_info,starts_at,capacity,canceled').gte('starts_at',new Date().toISOString()).order('starts_at',{ascending:true}).limit(100);
 if(!$('#eventList')||ui.page!=='sorties')return;
 if(error){root.innerHTML=`<div class="warn">${esc(communityFailure(error))}</div>`;return}
 if(!data?.length){root.innerHTML='<div class="panel empty-state">Aucune sortie à venir. Pourquoi ne pas en proposer une ?</div>';return}
 const names=await communityAuthor(data.map(x=>x.creator_id));
 const {data:mine}=await sb.from('community_event_participants').select('event_id').eq('member_id',me.id);
 const joined=new Set((mine||[]).map(x=>x.event_id));if(!$('#eventList')||ui.page!=='sorties')return;root.innerHTML='';
 for(const event of data){const card=document.createElement('article');card.className='community-entry';
  card.innerHTML=`<div class="entry-meta"><span class="pill">${event.canceled?'Annulée':'À venir'}</span><span>${esc(communityDate(event.starts_at))}</span></div>
  <h3>${esc(event.title)}</h3><p>⌖ ${esc(event.city)} · ${esc(names.get(event.creator_id)||'Membre')}</p>
  <p class="preserve-lines">${esc(event.description)}</p>${event.meeting_info?`<p class="hint">Lieu de rendez-vous public : ${esc(event.meeting_info)}</p>`:''}
  <p class="hint">Capacité maximale : ${event.capacity} personnes · Les coordonnées privées ne sont pas publiées.</p><div class="actions" data-actions></div><p class="feedback" data-status></p>`;
  const actions=card.querySelector('[data-actions]'),status=card.querySelector('[data-status]');
  if(event.creator_id===me.id){const cancel=document.createElement('button');cancel.className='quiet';cancel.disabled=event.canceled;cancel.textContent=event.canceled?'Sortie annulée':'Annuler ma sortie';cancel.onclick=async()=>{
   if(!confirm('Annuler cette sortie ? Les inscriptions seront conservées comme historique.'))return;
   const {error}=await sb.from('community_events').update({canceled:true}).eq('id',event.id);
   if(error)status.textContent=communityFailure(error);else await loadEvents();
  };actions.append(cancel)}
  else if(!event.canceled){const attend=document.createElement('button');attend.className=joined.has(event.id)?'secondary':'primary';attend.textContent=joined.has(event.id)?'Me désinscrire':'Je participe';attend.onclick=async()=>{
   attend.disabled=true;
   const action=joined.has(event.id)?sb.from('community_event_participants').delete().eq('event_id',event.id).eq('member_id',me.id):sb.from('community_event_participants').insert({event_id:event.id,member_id:me.id});
   const {error}=await action;if(error){status.textContent=communityFailure(error);attend.disabled=false}else await loadEvents();
  };actions.append(attend);const reportBtn=document.createElement('button');reportBtn.className='quiet';reportBtn.textContent='Signaler';reportBtn.onclick=()=>report(event.creator_id);actions.append(reportBtn)}
  root.append(card);
 }
}
function showEventForm(){
 const root=$('#eventList');if(!root)return;
 root.innerHTML=`<form id="eventForm" class="panel stack"><h3>Proposer une sortie</h3>
 <label>Nom de l’activité<input name="title" maxlength="120" minlength="5" required placeholder="Balade, café, musée…"></label>
 <div class="formgrid"><label>Commune<input name="city" maxlength="100" minlength="2" required placeholder="Nantes"></label>
 <label>Date et heure<input type="datetime-local" name="starts_at" required></label></div>
 <label>Lieu public de rendez-vous (facultatif)<input name="meeting_info" maxlength="180" placeholder="Devant la médiathèque, par exemple"></label>
 <label>Nombre maximal de personnes (2 à 60)<input type="number" name="capacity" value="12" min="2" max="60" required></label>
 <label>Description<textarea name="description" maxlength="1400" placeholder="Déroulement, durée, accessibilité…"></textarea></label>
 <p class="hint">Ne publie ni ton adresse personnelle ni ton numéro de téléphone dans la sortie.</p>
 <div class="actions"><button class="primary" type="submit">Publier la sortie</button><button class="secondary" type="button" id="cancelEvent">Annuler</button></div><p class="feedback" id="eventFormStatus"></p></form>`;
 $('#cancelEvent').onclick=loadEvents;
 $('#eventForm').onsubmit=async e=>{
  e.preventDefault();const form=e.currentTarget,b=form.elements;
  const date=new Date(b.starts_at.value);if(!Number.isFinite(date.getTime())||date<=new Date()){$('#eventFormStatus').textContent='Choisis une date et une heure futures.';return}
  const {error}=await sb.from('community_events').insert({creator_id:me.id,title:b.title.value.trim(),description:b.description.value.trim(),city:b.city.value.trim(),meeting_info:b.meeting_info.value.trim(),starts_at:date.toISOString(),capacity:Number(b.capacity.value)});
  if(error){$('#eventFormStatus').textContent=communityFailure(error);return}await loadEvents();
 };
}

function renderProfile(){
 const vals=me||{};
 $('#pageContent').innerHTML=`<div class="contenttop"><div><h2>Mon profil</h2><p>Tu choisis ce que les autres membres voient. Les informations sensibles restent facultatives.</p></div></div>
 <form id="profileForm" class="panel stack"><div class="formgrid">
 <label>Pseudo visible<input name="nickname" maxlength="60" required minlength="2" value="${esc(vals.nickname)}"></label>
 <label>Année de naissance (18 ans minimum)<input name="birth_year" type="number" min="1920" max="${new Date().getFullYear()-18}" value="${esc(vals.birth_year||'')}"></label>
 <label>Genre<select name="gender">${['','homme','femme','non-binaire','autre','non-précisé'].map(g=>`<option value="${g}" ${vals.gender===g?'selected':''}>${esc(g||'Je préfère ne pas préciser')}</option>`).join('')}</select></label>
 <label>Commune (jamais ton adresse)<input name="city" value="${esc(vals.city)}" placeholder="Ex. Nantes"></label>
 <label>Code postal (facultatif, précision de ville)<input name="postal_code" value="${esc(vals.postal_code||'')}" pattern="[0-9]{5}" placeholder="44000"></label>
 </div>
 <label>Quelques mots sur toi<textarea name="bio" maxlength="1400">${esc(vals.bio)}</textarea></label>
 <label>Centres d’intérêt (sépare avec des virgules)<input name="interests" value="${esc(fmt(vals.interests))}" placeholder="pêche, randonnée, lecture, cinéma…"></label>
 <label>Traits de personnalité (sépare avec des virgules)<input name="traits" value="${esc(fmt(vals.traits))}" placeholder="curieux, extraverti, doux, passionné…"></label>
 <label>Pour moi, un week-end idéal…<textarea name="ideal_weekend" maxlength="500">${esc(vals.ideal_weekend)}</textarea></label>
 <div><span class="fieldlabel">Je suis ouvert(e) à :</span><div class="checks goals">${checks(intents,vals.goals)}</div></div>
 <div class="twocol"><div class="panel"><h3>Affinités amoureuses (facultatif)</h3><p class="hint">Ces informations ne sont pas affichées publiquement et servent uniquement à vérifier la réciprocité des préférences.</p>
 <div class="checks seeking">${checks(['homme','femme','non-binaire','autre','non-précisé'],prefs.seeking_genders)}</div>
 <label>Âge minimum<input type="number" name="romantic_age_min" min="18" max="99" value="${prefs.romantic_age_min||18}"></label>
 <label>Âge maximum<input type="number" name="romantic_age_max" min="18" max="99" value="${prefs.romantic_age_max||99}"></label>
 <label class="privacy-consent"><input type="checkbox" name="romanticConsent" ${prefs.romantic_consent?'checked':''}> J’accepte expressément l’utilisation de mes préférences de genre pour le matching amoureux réciproque. Facultatif et révocable à tout moment. <a href="infos-legales.html#donnees-sensibles" target="_blank" rel="noopener">Comprendre ce traitement</a>.</label></div>
 <div class="panel"><h3>Photo et voix</h3><p class="hint">Photo authentique conseillée, sans nudité ni photo d’enfants. Les fichiers sont privés et nécessitent un accès membre.</p>
 <label>Photo principale (JPG, PNG ou WebP, optimisée avant envoi)<input id="profilePicture" type="file" accept="image/jpeg,image/png,image/webp"></label>
 <label>Extrait de voix (WebM, MP3, MP4 ou WAV, taille optimisée)<input id="profileVoice" type="file" accept="audio/webm,audio/mpeg,audio/mp4,audio/wav"></label>
 <p class="hint">Publier ma voix dans :</p><div class="checks voicegoals">${checks(intents,vals.voice_goals)}</div>
 <p id="uploadStatus" class="hint"></p></div></div>
 <label><input type="checkbox" name="visible" ${vals.visible?'checked':''}> Rendre mon profil visible aux membres connectés (uniquement si je suis majeur)</label>
 <div class="actions"><button type="submit" class="primary">Enregistrer mon profil</button><button type="button" class="secondary" id="geocodeBtn">Identifier ma commune pour le filtre de distance</button></div>
 <p class="hint">La localisation transmet uniquement la commune/le code postal à l’API publique de géocodage de l’IGN. Aucune géolocalisation GPS automatique.</p><div id="saveStatus" class="feedback" aria-live="polite"></div></form>`;
 $('#profileForm').onsubmit=saveProfile;$('#geocodeBtn').onclick=geocode;
 $('#profilePicture').onchange=e=>uploadProfile(e.target.files?.[0],'avatar');
 $('#profileVoice').onchange=e=>uploadProfile(e.target.files?.[0],'voice');
}
async function saveProfile(e){e.preventDefault();const f=e.target;const get=n=>f.elements[n].value.trim();
 const year=Number(get('birth_year'))||null; if(!year||new Date().getFullYear()-year<18){$('#saveStatus').textContent='Espace réservé aux adultes. Indique une année de naissance valide.';return}
 const changes={nickname:get('nickname'),birth_year:year,gender:get('gender')||null,city:get('city'),postal_code:get('postal_code'),bio:get('bio'),interests:split(get('interests')),traits:split(get('traits')),ideal_weekend:get('ideal_weekend'),goals:[...f.querySelectorAll('.goals input:checked')].map(x=>x.value),voice_goals:[...f.querySelectorAll('.voicegoals input:checked')].map(x=>x.value),visible:f.elements['visible'].checked,updated_at:new Date().toISOString()};
 const hasRomanticConsent=f.elements['romanticConsent'].checked;
 const seeking=hasRomanticConsent?[...f.querySelectorAll('.seeking input:checked')].map(x=>x.value):[];
 if(+get('romantic_age_min')>+get('romantic_age_max')){$('#saveStatus').textContent='La tranche d’âge amoureuse n’est pas cohérente.';return}
 const {error}=await sb.from('profiles').update(changes).eq('id',me.id);
 if(error){$('#saveStatus').textContent='Échec de sauvegarde : '+error.message;return}
 const {data,error:reloadError}=await sb.rpc('lli_get_my_profile');
 if(reloadError||!data){$('#saveStatus').textContent='Profil enregistré, mais lecture sécurisée impossible : '+(reloadError?.message||'réessaie');return}
 const saveConsent=()=>sb.from('lli_privacy_consents').upsert({user_id:me.id,romantic_preferences:hasRomanticConsent,notice_version:'2026-10-28',updated_at:new Date().toISOString()},{onConflict:'user_id'});
 if(hasRomanticConsent){const {error:cError}=await saveConsent();if(cError){$('#saveStatus').textContent='Consentement non enregistré : '+cError.message;me=data;return}}
 const {error:pError}=await sb.from('private_preferences').update({seeking_genders:seeking,romantic_age_min:+get('romantic_age_min'),romantic_age_max:+get('romantic_age_max')}).eq('user_id',me.id);
 if(pError){$('#saveStatus').textContent='Profil enregistré, mais préférences non mises à jour : '+pError.message;me=data;return}
 if(!hasRomanticConsent){const {error:cError}=await saveConsent();if(cError){$('#saveStatus').textContent='Préférences retirées, mais révocation non confirmée : '+cError.message;me=data;return}}
 me=data;prefs={...prefs,seeking_genders:seeking,romantic_age_min:+get('romantic_age_min'),romantic_age_max:+get('romantic_age_max'),romantic_consent:hasRomanticConsent};
 $('#userBadge').textContent=me.nickname;$('#saveStatus').textContent='Profil et choix de confidentialité enregistrés.';
}
async function geocode(){const f=$('#profileForm');const city=f.elements['city'].value.trim(),postal=f.elements['postal_code'].value.trim();
 if(!city){$('#saveStatus').textContent='Indique une commune d’abord.';return}
 $('#saveStatus').textContent='Recherche de la commune auprès de l’IGN…';
 try{const q=encodeURIComponent([city,postal].filter(Boolean).join(' '));const res=await fetch('https://data.geopf.fr/geocodage/search?q='+q+'&limit=1&type=municipality');if(!res.ok)throw Error('Service indisponible');const data=await res.json();const c=data.features?.[0]?.geometry?.coordinates; if(!c)throw Error('Commune introuvable');
 const {error}=await sb.from('profiles').update({longitude:c[0],latitude:c[1]}).eq('id',me.id);if(error)throw error;me.longitude=c[0];me.latitude=c[1];$('#saveStatus').textContent='Commune localisée (centre de la commune uniquement). Enregistre aussi tes autres modifications si nécessaire.';
 }catch(e){$('#saveStatus').textContent='Localisation impossible : '+e.message+' — essaie une autre commune ou le code postal.'}}
async function uploadProfile(file,kind){if(!file)return;const originalSize=file.size;$('#uploadStatus').textContent='Optimisation du fichier…';file=await prepareMedia(file);if(file.size>10*1024*1024){$('#uploadStatus').textContent='Fichier trop volumineux après optimisation (10 Mo maximum).';return}
 const allow=kind==='avatar'?['image/jpeg','image/png','image/webp']:['audio/webm','audio/mpeg','audio/mp4','audio/wav'];if(!allow.includes(file.type)){$('#uploadStatus').textContent='Format non accepté.';return}
 $('#uploadStatus').textContent='Envoi privé en cours…';
 const ext=kind==='avatar'?'image':'voice';const path=`${me.id}/${ext}-${crypto.randomUUID()}`;
 const {error}=await sb.storage.from('private-profiles').upload(path,file,{contentType:file.type});if(error){$('#uploadStatus').textContent='Échec : '+error.message;return}
 const field=kind==='avatar'?'avatar_path':'voice_path';const {error:e2}=await sb.from('profiles').update({[field]:path}).eq('id',me.id);
 if(e2){$('#uploadStatus').textContent='Fichier reçu, mais liaison au profil impossible : '+e2.message;return}
 me[field]=path;$('#uploadStatus').textContent=(kind==='avatar'?'Photo ajoutée au profil. ':'Extrait de voix enregistré. ')+(file.size<originalSize?'Fichier optimisé : '+mb(originalSize)+' → '+mb(file.size)+'. ':'')+(kind==='voice'?'Sa visibilité dépend des rubriques cochées dans ton profil.':'');
}
function renderExplorer(){
 const adminPreviewButton=ui.canPreview&&!ui.preview?'<button type="button" id="startPreview" class="secondary">Aperçu administrateur · 40 profils</button>':'';
 const modeBanner=ui.preview?`<div class="notice" style="border:2px solid #e3aa3f;background:#fff8e9;color:#553609"><strong>APERÇU : 40 PROFILS FICTIFS</strong> — Teste les filtres, les fiches et la messagerie d'exemple. Aucun faux compte n'est enregistré. Aucun échange n'est envoyé.<br><button type="button" id="leavePreview" class="secondary" style="margin-top:12px">Revenir aux vrais membres</button></div>`:'';
 $('#pageContent').innerHTML=`<div class="contenttop"><div><h2>Découvrir les membres</h2><p>${ui.preview?'Aperçu des filtres sur des profils fictifs. Aucune correspondance réelle.':'Seuls les profils volontaires et majeurs sont proposés. Les critères amoureux sont réciproques.'}</p></div><button class="secondary" id="surprise">✦ Surprends-moi</button></div>${modeBanner}
 <div class="filters panel"><label>Intention<select id="intent">${ui.preview?'<option value="">Toutes les intentions</option>':''}${intents.map(g=>`<option value="${g}">${g}</option>`).join('')}</select></label>
 <label>Genre recherché<select id="gender"><option value="">Tous</option>${['homme','femme','non-binaire','autre','non-précisé'].map(x=>`<option>${x}</option>`).join('')}</select></label>
 <label>Âge min.<input type="number" id="ageMin" min="18" max="99" value="18"></label><label>Âge max.<input type="number" id="ageMax" min="18" max="99" value="99"></label>
 <label>Distance max. (km)<select id="distance"><option value="">France entière</option>${[20,50,100,200,500,1000].map(v=>`<option value="${v}">${v} km</option>`).join('')}</select></label></div>
 <div class="actions"><button class="primary" id="searchBtn">Rechercher</button>${adminPreviewButton}<span class="hint">Distance calculée seulement si les communes des deux membres sont localisées.</span></div><div id="results" class="grid"></div><p id="resultsStatus" class="hint"></p>`;
 $('#searchBtn').onclick=search;$('#surprise').onclick=surprise;
  if(ui.canPreview&&!ui.preview)$('#startPreview').onclick=()=>{ui.preview=true;ui.active=null;const url=new URL(location.href);url.searchParams.set('apercu','1');history.replaceState(null,'',url.toString());page('explorer')};
 if(ui.preview)$('#leavePreview').onclick=()=>{ui.preview=false;ui.active=null;const url=new URL(location.href);url.searchParams.delete('apercu');history.replaceState(null,'',url.toString());page('explorer')};
 search();
}
async function search(){if(!ui.preview&&(!isAdult(me)||!me.visible||!me.goals?.length)){notice('Complète ton année de naissance, choisis tes intentions et active la visibilité de ton profil avant la recherche.','#results');return}
 const i=$('#intent').value, g=$('#gender').value, min=Number($('#ageMin').value)||18,max=Number($('#ageMax').value)||99,km=$('#distance').value;
 $('#resultsStatus').textContent='Recherche des affinités…';
 let data,error;
 if(ui.preview){data=previewFind({intent:i,gender:g,min,max,km:km?Number(km):null});error=null}
 else ({data,error}=await sb.rpc('find_matches',{intent_filter:i,gender_filter:g||null,age_min:min,age_max:max,max_km:km?Number(km):null}));
 if(error){notice('Recherche impossible : '+error.message,'#results');return}
 ui.list=data||[];const res=$('#results');res.innerHTML='';
 if(!ui.list.length){notice('Aucun profil ne correspond actuellement à ces critères. Essaye une autre intention ou élargis tes filtres.','#results');$('#resultsStatus').textContent='';return}
 for(const p of ui.list){const card=document.createElement('article');card.className='profilecard';card.innerHTML=`<div class="cardcover"><div class="avatar" data-picture>${esc(p.nickname[0]||'?')}</div></div><div class="cardbody">${p.fictif?previewFlag():''}<h3>${esc(p.nickname)} · ${ageOf(p)||'—'} ans</h3><p>⌖ ${esc(p.city||'Commune non indiquée')}${p.distance_km!=null?' · '+p.distance_km+' km':''}</p><div class="pillset">${(p.interests||[]).slice(0,3).map(x=>`<span class="pill">${esc(x)}</span>`).join('')}</div><p>${esc((p.bio||'').slice(0,130))}</p><button class="secondary" data-view="${p.id}">Découvrir</button></div>`;
 res.appendChild(card);card.querySelector('[data-view]').onclick=()=>showMember(p);
 if(p.avatar_path){const src=await mediaUrl('private-profiles',p.avatar_path);if(src){const img=document.createElement('img');img.src=src;img.className='avatar';img.alt='Photo de profil';card.querySelector('[data-picture]').replaceWith(img)}}
 }
 $('#resultsStatus').textContent=ui.preview?`${ui.list.length} profils fictifs correspondent aux filtres. Ces suggestions ne représentent aucun membre réel.`:`${ui.list.length} profil(s) compatibles — ordre des affinités, sans pourcentage inventé.`;
}
function surprise(){if(!ui.list.length){$('#resultsStatus').textContent='Aucun membre compatible avec les filtres sélectionnés.';return}const sample=ui.list[Math.floor(Math.random()*(ui.preview?ui.list.length:Math.min(ui.list.length,10)))];showMember(sample)}
async function showMember(p){ui.active=p;$('#modalTitle').textContent=p.nickname+' · '+ageOf(p)+' ans'+(p.fictif?' · FICTIF':'');let html=`<p>⌖ ${esc(p.city)} ${p.distance_km!=null?'· '+p.distance_km+' km':''}</p><p>${esc(p.bio)}</p><p><strong>Centres d’intérêt :</strong> ${esc(fmt(p.interests))}</p><p><strong>Personnalité :</strong> ${esc(fmt(p.traits))}</p><p><strong>Week-end idéal :</strong> ${esc(p.ideal_weekend)}</p><div id="memberMedia"></div><div class="actions"><button id="writeToMember" class="primary">Envoyer un message</button><button id="blockMember" class="secondary">Bloquer</button><button id="reportMember" class="secondary">Signaler</button></div>`;
 if(p.fictif)html=html.replace('<div id="memberMedia"></div>','<p><strong>Fiche fictive :</strong> ce profil n’existe pas dans la base des membres.</p><div id="memberMedia"></div>').replace('Envoyer un message','Voir une conversation fictive');
 $('#modalContent').innerHTML=html;$('#modal').hidden=false;
 if(p.fictif){$('#blockMember').remove();$('#reportMember').remove();$('#writeToMember').onclick=()=>{$('#modal').hidden=true;renderPreviewChat(p)};return}
 $('#writeToMember').onclick=()=>{ui.active=p;$('#modal').hidden=true;page('messages')};
 $('#blockMember').onclick=()=>block(p.id);$('#reportMember').onclick=()=>report(p.id);
 if(p.voice_path && p.voice_goals?.some(x=>me.goals?.includes(x))){const url=await mediaUrl('private-profiles',p.voice_path);if(url){const parent=$('#memberMedia');if(parent){const t=document.createElement('p');t.textContent='Tu es sensible aux voix ? Écoute cet extrait :';const aud=document.createElement('audio');aud.controls=true;aud.src=url;parent.append(t,aud)}}}
}
async function renderMessages(){if(ui.preview){renderPreviewChat(ui.active?.fictif?ui.active:previewPeople[0]);return}const target=$('#pageContent');target.innerHTML=`<div class="contenttop"><div><h2>Messages privés</h2><p>Échanges visibles uniquement par les interlocuteurs. Ni photo ni vocal ne sont publics.</p></div><button id="refreshMessages" class="secondary">Actualiser</button></div><div class="chatbox"><div id="chatmembers" class="chatmembers"></div><div class="panel"><div id="chatlog" class="chatlog">Sélectionne une personne.</div><div class="chatcompose"><textarea id="chatText" maxlength="4000" placeholder="Écris un message…"></textarea><label class="secondary filebutton">Photo / vocal<input id="chatFile" type="file" accept="image/jpeg,image/png,image/webp,audio/webm,audio/mpeg,audio/mp4,audio/wav"></label><button class="primary" id="sendMsg">Envoyer</button></div><div class="actions"><button id="recordBtn" class="quiet">🎙 Enregistrer un vocal</button><button id="stopBtn" class="quiet" disabled>■ Stop</button><span id="chatAttachment" class="hint">Aucune pièce jointe</span></div><p id="chatStatus" class="hint"></p></div></div>`;
 const {data,error}=await sb.rpc('find_matches',{intent_filter:(me.goals||[])[0]||'amitié',age_min:18,age_max:99});
 const matches=data||[]; const ids=new Map(matches.map(m=>[m.id,m]));if(ui.active)ids.set(ui.active.id,ui.active);
 // Retrieve message partners without leaking unrelated members.
 const {data:history}=await sb.from('messages').select('sender_id,recipient_id').or(`sender_id.eq.${me.id},recipient_id.eq.${me.id}`).order('created_at',{ascending:false}).limit(200);
 const partnerIds=[...new Set((history||[]).flatMap(m=>[m.sender_id,m.recipient_id]).filter(id=>id!==me.id))].filter(id=>!blocked.has(id));
 if(partnerIds.length){const {data:people}=await sb.from('profiles').select('id,nickname,visible').in('id',partnerIds);for(const p of people||[])ids.set(p.id,p)}
 const list=[...ids.values()].filter(p=>p.id!==me.id&&!blocked.has(p.id));
 $('#chatmembers').innerHTML=list.length?list.map(p=>`<button data-partner="${p.id}">${esc(p.nickname)}</button>`).join(''):'<p class="hint">Aucun échange pour le moment. Découvre les membres et écris un premier message.</p>';
 $('#chatmembers').querySelectorAll('button').forEach(b=>b.onclick=()=>selectPartner(ids.get(b.dataset.partner)));
 $('#refreshMessages').onclick=()=> ui.active?loadMessages(ui.active):renderMessages();
 $('#sendMsg').onclick=sendMessage;
 $('#chatFile').onchange=e=>{ui.media=e.target.files?.[0]||null;$('#chatAttachment').textContent=ui.media?.name||'Aucune pièce jointe'};
 $('#recordBtn').onclick=startRecord;$('#stopBtn').onclick=stopRecord;
 if(ui.active && ids.has(ui.active.id))await selectPartner(ui.active);
}
async function selectPartner(p){if(!p)return;ui.active=p;$('#chatmembers').querySelectorAll('button').forEach(b=>b.classList.toggle('selected',b.dataset.partner===p.id));await loadMessages(p)}
async function loadMessages(p){const box=$('#chatlog');box.textContent='Chargement de la conversation…';
 const {data,error}=await sb.from('messages').select('*').or(`and(sender_id.eq.${me.id},recipient_id.eq.${p.id}),and(sender_id.eq.${p.id},recipient_id.eq.${me.id})`).order('created_at',{ascending:true}).limit(150);
 if(error){box.textContent='Impossible de charger : '+error.message;return}
 box.innerHTML=`<p class="hint">Conversation avec ${esc(p.nickname)} — les fichiers joints sont privés.</p>`;
 for(const m of data||[]){const el=document.createElement('div');el.className='bubble '+(m.sender_id===me.id?'mine':'');const txt=document.createElement('div');txt.textContent=m.body;el.append(txt);
 if(m.media_path){const url=await mediaUrl('private-messages',m.media_path);if(url){let media;if(m.media_kind==='image'){media=document.createElement('img');media.alt='Image jointe';media.src=url}else{media=document.createElement('audio');media.controls=true;media.src=url}el.append(media)}}
 const time=document.createElement('small');time.textContent=new Date(m.created_at).toLocaleString('fr-FR');el.append(time);box.appendChild(el)}box.scrollTop=box.scrollHeight;
}
async function sendMessage(){if(!ui.active){$('#chatStatus').textContent='Choisis un destinataire.';return}
 const text=$('#chatText').value.trim();let file=ui.media;if(!text&&!file)return;
 const rawSize=file?.size||0; if(file){$('#chatStatus').textContent='Optimisation du média…';file=await prepareMedia(file)}
 if(file&&file.size>10*1024*1024){$('#chatStatus').textContent='Fichier trop volumineux après optimisation (10 Mo maximum).';return}
 $('#chatStatus').textContent='Envoi…';let path=null,kind=null;
 if(file){const allowed=['image/jpeg','image/png','image/webp','audio/webm','audio/mpeg','audio/mp4','audio/wav'];if(!allowed.includes(file.type)){$('#chatStatus').textContent='Format refusé.';return}
 path=`${me.id}/${crypto.randomUUID()}`;kind=file.type.startsWith('image/')?'image':'audio';
 const {error}=await sb.storage.from('private-messages').upload(path,file,{contentType:file.type});if(error){$('#chatStatus').textContent='Échec du transfert : '+error.message;return}}
 const {error}=await sb.from('messages').insert({sender_id:me.id,recipient_id:ui.active.id,body:text,media_path:path,media_kind:kind});
 if(error){$('#chatStatus').textContent='Message non envoyé : '+error.message;return}
 $('#chatText').value='';ui.media=null;$('#chatFile').value='';$('#chatAttachment').textContent='Aucune pièce jointe';$('#chatStatus').textContent='Message envoyé.'+(file&&file.size<rawSize?' Média optimisé : '+mb(rawSize)+' → '+mb(file.size)+'.':'');await loadMessages(ui.active);
}
let recorder, chunks=[];async function startRecord(){if(!navigator.mediaDevices?.getUserMedia){$('#chatStatus').textContent='Micro indisponible dans ce navigateur. Choisis un fichier audio.';return}
 try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});const mime=['audio/webm;codecs=opus','audio/mp4'].find(t=>MediaRecorder.isTypeSupported(t));recorder=new MediaRecorder(stream,{...(mime?{mimeType:mime}:{}),audioBitsPerSecond:32000});chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.onstop=()=>{const type=recorder.mimeType||'audio/webm';ui.media=new File(chunks,type.includes('mp4')?'vocal.m4a':'vocal.webm',{type:type.split(';')[0]});$('#chatAttachment').textContent='Vocal enregistré — prêt à envoyer';stream.getTracks().forEach(t=>t.stop())};recorder.start();$('#recordBtn').disabled=true;$('#stopBtn').disabled=false;$('#chatStatus').textContent='Enregistrement en cours (60 secondes max).';setTimeout(()=>{if(recorder?.state==='recording')stopRecord()},60000)}catch(e){$('#chatStatus').textContent='Autorisation micro refusée ou indisponible.'}}
function stopRecord(){if(recorder?.state==='recording')recorder.stop();$('#recordBtn').disabled=false;$('#stopBtn').disabled=true}
function renderSecurity(){
 $('#pageContent').innerHTML=`<div class="contenttop"><div><h2>Confidentialité et sécurité</h2><p>Tu gardes le contrôle de ton profil, de tes préférences et de tes échanges.</p></div></div>
 <div class="panel stack"><h3>Contrôler mes données</h3><p><a href="infos-legales.html#confidentialite" target="_blank" rel="noopener">Politique de confidentialité et RGPD</a> · <a href="infos-legales.html#regles" target="_blank" rel="noopener">Règles de la communauté</a></p>
 <p>Les profils non visibles ne sont pas proposés aux autres membres. Les photos et vocaux peuvent être consultés selon les droits d’accès de la plateforme. Ne publie jamais de diagnostic ni d’information médicale dans un forum ou un salon.</p>
 <button id="exportPrivacy" type="button" class="secondary">Exporter mes données en JSON</button><p class="hint">L’export comprend les données structurées accessibles depuis ton compte ; les fichiers photos et vocaux nécessitent une demande complémentaire.</p><p class="feedback" id="privacyExportStatus"></p></div>
 <form id="privacyRequestForm" class="panel stack"><h3>Exercer mes droits RGPD</h3>
 <p>Tu peux demander l’accès à tes données, leur rectification, la suppression de ton compte ou poser une question. Les demandes sont transmises à l’administration et traitées manuellement après vérification.</p>
 <label>Type de demande<select id="privacyRequestKind" required><option value="access">Accéder à mes données</option><option value="rectification">Corriger mes données</option><option value="deletion">Supprimer mon compte et mes données</option><option value="other">Autre demande</option></select></label>
 <label>Précisions facultatives<textarea id="privacyRequestText" maxlength="1500" placeholder="Explique ta demande sans communiquer de mot de passe ni de donnée médicale."></textarea></label>
 <button class="primary" type="submit">Enregistrer ma demande</button><p id="privacyRequestStatus" class="feedback" role="status"></p>
 <p class="hint">Une demande de suppression n’efface pas automatiquement le compte : la suppression sera effectuée après traitement de la demande et de ses fichiers stockés.</p></form>
 <div class="panel"><h3>Mes blocages</h3><p>${blocked.size} membre(s) bloqué(s). Pour bloquer ou signaler un membre, ouvre sa fiche depuis Découvrir.</p></div>`;
 $('#privacyRequestForm').onsubmit=submitPrivacyRequest;
 $('#exportPrivacy').onclick=exportMyData;
}
async function submitPrivacyRequest(event){
 event.preventDefault();
 const target=$('#privacyRequestStatus');const kind=$('#privacyRequestKind').value;
 const details=$('#privacyRequestText').value.trim();
 if(!['access','rectification','deletion','other'].includes(kind)){target.textContent='Demande invalide.';return}
 if(kind==='deletion'&&!confirm('Confirmer la demande de suppression de ton compte ? La suppression ne sera pas immédiate.'))return;
 const {error}=await sb.from('lli_privacy_requests').insert({user_id:me.id,kind,details});
 if(error){target.textContent='Demande non enregistrée : '+error.message;return}
 target.textContent='Demande enregistrée. Elle sera examinée par l’administration.';
 $('#privacyRequestText').value='';
}
async function exportMyData(){
 const status=$('#privacyExportStatus');status.textContent='Préparation de ton export…';
 const queries={
  profil:()=>sb.rpc('lli_get_my_profile'),
  preferences:()=>sb.from('private_preferences').select('*').eq('user_id',me.id),
  consentements:()=>sb.from('lli_privacy_consents').select('*').eq('user_id',me.id),
  blocages:()=>sb.from('blocks').select('*').eq('blocker_id',me.id),
  signalements:()=>sb.from('reports').select('*').eq('reporter_id',me.id),
  messages:()=>sb.from('messages').select('*').or(`sender_id.eq.${me.id},recipient_id.eq.${me.id}`),
  sujets:()=>sb.from('community_topics').select('*').eq('author_id',me.id),
  reponses:()=>sb.from('community_replies').select('*').eq('author_id',me.id),
  messages_salons:()=>sb.from('community_room_messages').select('*').eq('author_id',me.id),
  sorties:()=>sb.from('community_events').select('*').eq('creator_id',me.id),
  participations:()=>sb.from('community_event_participants').select('*').eq('member_id',me.id),
  demandes_rgpd:()=>sb.from('lli_privacy_requests').select('*').eq('user_id',me.id)
 };
 try{
  const entries=await Promise.all(Object.entries(queries).map(async ([key,fn])=>{
   const {data,error}=await fn();if(error)throw new Error(key+': '+error.message);
   return [key,data];
  }));
  const doc={application:'LES LIENS INDOCILES',date_export:new Date().toISOString(),limite:'Données structurées accessibles ; fichiers médias non inclus dans ce JSON',...Object.fromEntries(entries)};
  const blob=new Blob([JSON.stringify(doc,null,2)],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob);const link=document.createElement('a');
  link.href=url;link.download='mes_donnees_les_liens_indociles.json';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  status.textContent='Export généré localement. Conserve ce fichier dans un endroit privé.';
 }catch(e){status.textContent='Export incomplet, aucun fichier remis : '+e.message}
}

async function block(id){const {error}=await sb.from('blocks').insert({blocker_id:me.id,blocked_id:id});if(error){alert('Blocage impossible : '+error.message);return}blocked.add(id);$('#modal').hidden=true;page('explorer')}
async function report(id){const reason=prompt('Motif : harcelement, contenu, usurpation, autre','autre');if(!reason)return;if(!['harcelement','contenu','usurpation','autre'].includes(reason)){alert('Motif non reconnu');return}
 const details=(prompt('Détails facultatifs pour les administrateurs','')||'').slice(0,1500);const {error}=await sb.from('reports').insert({reporter_id:me.id,target_id:id,reason,details});alert(error?'Signalement impossible : '+error.message:'Signalement enregistré.');}
init();
