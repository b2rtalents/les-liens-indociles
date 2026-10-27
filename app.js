/* LES LIENS INDOCILES — client bêta. Aucun secret serveur dans ce fichier. */
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = a => Array.isArray(a) ? a.join(', ') : '';
const split = a => [...new Set(String(a||'').split(/[,;\n]/).map(s=>s.trim()).filter(Boolean))].slice(0,35);
const intents = ['amitié','amour','entraide','sorties'];
const cfg = window.LLI_CONFIG || {};
const ok = /^https:\/\//.test(cfg.url||'') && !cfg.url.includes('VOTRE-') && cfg.publishableKey && !cfg.publishableKey.includes('VOTRE-');
const ui = {page:'explorer', list:[], active:null, media:null, connected:false};
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

const alertAuth=txt=>{$('#authMessage').textContent=txt};
const setSection=id=>{for(const n of ['publicHome','authPanel','app','setup'])$('#'+n).hidden=n!==id;};
const ageOf=p=>p.birth_year ? new Date().getFullYear()-p.birth_year : null;
const isAdult=p=>p.birth_year && ageOf(p)>=18;
const mediaUrl=async(bucket,path)=>{if(!path)return null; const {data,error}=await sb.storage.from(bucket).createSignedUrl(path,3600);return error?null:data.signedUrl;};
async function init(){
 const openAuth=(mode)=>{setSection('authPanel');$('#authTitle').textContent=mode==='signup'?'Créer mon compte':'Me connecter';$('#signUpBtn').classList.toggle('primary',mode==='signup');$('#signUpBtn').classList.toggle('secondary',mode!=='signup');$('#signInBtn').classList.toggle('primary',mode!=='signup');$('#signInBtn').classList.toggle('secondary',mode==='signup');alertAuth('');};
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
   sb=mod.createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
   const {data,error}=await sb.auth.getSession();if(error)throw error;
   session=data.session;
   sb.auth.onAuthStateChange((_event,s)=>{ if(_event==='SIGNED_OUT'){session=null;setSection('publicHome')} });
   if(session)await enter();else setSection('publicHome');
 }catch(e){setSection('publicHome');$('#loginOpen').disabled=true;$('#signupOpen').disabled=true;$('#availabilityInfo').textContent='Les inscriptions sont temporairement indisponibles. Réessaie ultérieurement.';}
}
async function auth(signup){
 const email=$('#authEmail').value.trim().toLowerCase(),password=$('#authPassword').value;
 if(!email.includes('@')||password.length<10){alertAuth('Indique une adresse e-mail et un mot de passe d’au moins 10 caractères.');return}
 alertAuth('Connexion en cours…');
 const {data,error}=signup ? await sb.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}}) : await sb.auth.signInWithPassword({email,password});
 if(error){alertAuth('Opération impossible : '+error.message);return}
 if(signup && !data.session){alertAuth('Si ton adresse est invitée, vérifie le courriel de confirmation avant de te connecter.');return}
 session=data.session;await enter();
}
async function enter(){
 const {data:{user},error}=await sb.auth.getUser();if(error||!user){setSection('authPanel');return}
 const [{data:profile,error:e1},{data:pr},{data:bl}]=await Promise.all([
 sb.from('profiles').select('*').eq('id',user.id).single(),
 sb.from('private_preferences').select('*').eq('user_id',user.id).maybeSingle(),
 sb.from('blocks').select('blocked_id').eq('blocker_id',user.id)
 ]);
 if(e1||!profile){setSection('authPanel');alertAuth('Le profil n’a pas été initialisé. Signale le problème à l’administrateur.');return}
 me=profile;prefs=pr||{};blocked=new Set((bl||[]).map(x=>x.blocked_id));ui.connected=true;
 $('#userBadge').textContent=me.nickname;$('#logoutBtn').hidden=false;
 setSection('app');await page('profil');
}
function page(name){ui.page=name;document.querySelectorAll('.tabs [data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===name));
 if(name==='profil')renderProfile();if(name==='explorer')renderExplorer();if(name==='messages')renderMessages();if(name==='securite')renderSecurity();}
const checks=(values,selected)=>values.map(v=>`<label><input type="checkbox" value="${esc(v)}" ${selected?.includes(v)?'checked':''}> ${esc(v)}</label>`).join('');
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
 <label>Âge maximum<input type="number" name="romantic_age_max" min="18" max="99" value="${prefs.romantic_age_max||99}"></label></div>
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
 const seeking=[...f.querySelectorAll('.seeking input:checked')].map(x=>x.value);
 if(+get('romantic_age_min')>+get('romantic_age_max')){$('#saveStatus').textContent='La tranche d’âge amoureuse n’est pas cohérente.';return}
 const {data,error}=await sb.from('profiles').update(changes).eq('id',me.id).select().single();
 if(error){$('#saveStatus').textContent='Échec de sauvegarde : '+error.message;return}
 const {error:pError}=await sb.from('private_preferences').update({seeking_genders:seeking,romantic_age_min:+get('romantic_age_min'),romantic_age_max:+get('romantic_age_max')}).eq('user_id',me.id);
 me=data;prefs={...prefs,seeking_genders:seeking,romantic_age_min:+get('romantic_age_min'),romantic_age_max:+get('romantic_age_max')};
 $('#userBadge').textContent=me.nickname;$('#saveStatus').textContent=pError?'Profil enregistré, mais préférences amoureuses non enregistrées : '+pError.message:'Profil enregistré.';
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
 $('#pageContent').innerHTML=`<div class="contenttop"><div><h2>Découvrir les membres</h2><p>Seuls les profils volontaires et majeurs sont proposés. Les critères amoureux sont réciproques.</p></div><button class="secondary" id="surprise">✦ Surprends-moi</button></div>
 <div class="filters panel"><label>Intention<select id="intent">${intents.map(g=>`<option value="${g}">${g}</option>`).join('')}</select></label>
 <label>Genre recherché<select id="gender"><option value="">Tous</option>${['homme','femme','non-binaire','autre','non-précisé'].map(x=>`<option>${x}</option>`).join('')}</select></label>
 <label>Âge min.<input type="number" id="ageMin" min="18" max="99" value="18"></label><label>Âge max.<input type="number" id="ageMax" min="18" max="99" value="99"></label>
 <label>Distance max. (km)<select id="distance"><option value="">France entière</option>${[20,50,100,200,500,1000].map(v=>`<option value="${v}">${v} km</option>`).join('')}</select></label></div>
 <div class="actions"><button class="primary" id="searchBtn">Rechercher</button><span class="hint">Distance calculée seulement si les communes des deux membres sont localisées.</span></div><div id="results" class="grid"></div><p id="resultsStatus" class="hint"></p>`;
 $('#searchBtn').onclick=search;$('#surprise').onclick=surprise;
 search();
}
async function search(){if(!isAdult(me)||!me.visible||!me.goals?.length){notice('Complète ton année de naissance, choisis tes intentions et active la visibilité de ton profil avant la recherche.','#results');return}
 const i=$('#intent').value, g=$('#gender').value, min=Number($('#ageMin').value)||18,max=Number($('#ageMax').value)||99,km=$('#distance').value;
 $('#resultsStatus').textContent='Recherche des affinités…';
 const {data,error}=await sb.rpc('find_matches',{intent_filter:i,gender_filter:g||null,age_min:min,age_max:max,max_km:km?Number(km):null});
 if(error){notice('Recherche impossible : '+error.message,'#results');return}
 ui.list=data||[];const res=$('#results');res.innerHTML='';
 if(!ui.list.length){notice('Aucun profil ne correspond actuellement à ces critères. Essaye une autre intention ou élargis tes filtres.','#results');$('#resultsStatus').textContent='';return}
 for(const p of ui.list){const card=document.createElement('article');card.className='profilecard';card.innerHTML=`<div class="cardcover"><div class="avatar" data-picture>${esc(p.nickname[0]||'?')}</div></div><div class="cardbody"><h3>${esc(p.nickname)} · ${ageOf(p)||'—'} ans</h3><p>⌖ ${esc(p.city||'Commune non indiquée')}${p.distance_km!=null?' · '+p.distance_km+' km':''}</p><div class="pillset">${(p.interests||[]).slice(0,3).map(x=>`<span class="pill">${esc(x)}</span>`).join('')}</div><p>${esc((p.bio||'').slice(0,130))}</p><button class="secondary" data-view="${p.id}">Découvrir</button></div>`;
 res.appendChild(card);card.querySelector('[data-view]').onclick=()=>showMember(p);
 if(p.avatar_path){const src=await mediaUrl('private-profiles',p.avatar_path);if(src){const img=document.createElement('img');img.src=src;img.className='avatar';img.alt='Photo de profil';card.querySelector('[data-picture]').replaceWith(img)}}
 }
 $('#resultsStatus').textContent=`${ui.list.length} profil(s) compatibles — ordre des affinités, sans pourcentage inventé.`;
}
function surprise(){if(!ui.list.length){$('#resultsStatus').textContent='Aucun membre compatible avec les filtres sélectionnés.';return}const sample=ui.list[Math.floor(Math.random()*Math.min(ui.list.length,10))];showMember(sample)}
async function showMember(p){ui.active=p;$('#modalTitle').textContent=p.nickname+' · '+ageOf(p)+' ans';let html=`<p>⌖ ${esc(p.city)} ${p.distance_km!=null?'· '+p.distance_km+' km':''}</p><p>${esc(p.bio)}</p><p><strong>Centres d’intérêt :</strong> ${esc(fmt(p.interests))}</p><p><strong>Personnalité :</strong> ${esc(fmt(p.traits))}</p><p><strong>Week-end idéal :</strong> ${esc(p.ideal_weekend)}</p><div id="memberMedia"></div><div class="actions"><button id="writeToMember" class="primary">Envoyer un message</button><button id="blockMember" class="secondary">Bloquer</button><button id="reportMember" class="secondary">Signaler</button></div>`;
 $('#modalContent').innerHTML=html;$('#modal').hidden=false;
 $('#writeToMember').onclick=()=>{ui.active=p;$('#modal').hidden=true;page('messages')};
 $('#blockMember').onclick=()=>block(p.id);$('#reportMember').onclick=()=>report(p.id);
 if(p.voice_path && p.voice_goals?.some(x=>me.goals?.includes(x))){const url=await mediaUrl('private-profiles',p.voice_path);if(url){const parent=$('#memberMedia');if(parent){const t=document.createElement('p');t.textContent='Tu es sensible aux voix ? Écoute cet extrait :';const aud=document.createElement('audio');aud.controls=true;aud.src=url;parent.append(t,aud)}}}
}
async function renderMessages(){const target=$('#pageContent');target.innerHTML=`<div class="contenttop"><div><h2>Messages privés</h2><p>Échanges visibles uniquement par les interlocuteurs. Ni photo ni vocal ne sont publics.</p></div><button id="refreshMessages" class="secondary">Actualiser</button></div><div class="chatbox"><div id="chatmembers" class="chatmembers"></div><div class="panel"><div id="chatlog" class="chatlog">Sélectionne une personne.</div><div class="chatcompose"><textarea id="chatText" maxlength="4000" placeholder="Écris un message…"></textarea><label class="secondary filebutton">Photo / vocal<input id="chatFile" type="file" accept="image/jpeg,image/png,image/webp,audio/webm,audio/mpeg,audio/mp4,audio/wav"></label><button class="primary" id="sendMsg">Envoyer</button></div><div class="actions"><button id="recordBtn" class="quiet">🎙 Enregistrer un vocal</button><button id="stopBtn" class="quiet" disabled>■ Stop</button><span id="chatAttachment" class="hint">Aucune pièce jointe</span></div><p id="chatStatus" class="hint"></p></div></div>`;
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
 $('#pageContent').innerHTML=`<div class="panel"><h2>Confidentialité et sécurité</h2><p>Ce cercle est réservé aux personnes invitées et majeures. L’adresse exacte, le diagnostic et l’orientation ne sont pas affichés dans les profils. Les préférences sentimentales ne sont utilisées que pour le matching réciproque.</p><p>Tu peux bloquer ou signaler un membre depuis sa fiche. Si tu souhaites effacer ton compte et tes données, contacte l’administrateur du site ; la suppression automatique autonome n'est pas encore développée.</p><p class="warn">Ne partage pas de donnée sensible ou intime dans tes échanges. Tu peux bloquer ou signaler un membre à tout moment.</p><h3>Membres bloqués</h3><p>${blocked.size} membre(s) bloqué(s).</p></div>`;
}
async function block(id){const {error}=await sb.from('blocks').insert({blocker_id:me.id,blocked_id:id});if(error){alert('Blocage impossible : '+error.message);return}blocked.add(id);$('#modal').hidden=true;page('explorer')}
async function report(id){const reason=prompt('Motif : harcelement, contenu, usurpation, autre','autre');if(!reason)return;if(!['harcelement','contenu','usurpation','autre'].includes(reason)){alert('Motif non reconnu');return}
 const details=(prompt('Détails facultatifs pour les administrateurs','')||'').slice(0,1500);const {error}=await sb.from('reports').insert({reporter_id:me.id,target_id:id,reason,details});alert(error?'Signalement impossible : '+error.message:'Signalement enregistré.');}
init();
