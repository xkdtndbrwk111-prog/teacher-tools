"use strict";
/* Seating Manager V1.00 — integrated classroom + PE backup, format v2.
   Import commits both localStorage keys, verifies them, and reloads so
   the existing app and PE in-memory states are reconstructed together.
   No PE team assignments, reveals or history are exported. */
(()=>{
  const CLASS_KEY="teacher-tools.seating.state.v1";
  const PE_KEY="teacher-tools.seating.pe-prototype.v2";
  const TRAIT_KEYS=["leadership","intelligence","stamina","charm","initiative"];
  const SUCCESS_KEY="teacher-tools.seating.backup-import-notice.v2";
  const MAX_BYTES=10*1024*1024;
  const $=id=>document.getElementById(id);
  const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
  const object=value=>value!==null&&typeof value==="object"&&!Array.isArray(value);

  function normalizedSnapshot(snapshot,roster){
    if(!object(snapshot)||!Number.isInteger(snapshot.teamCount)||snapshot.teamCount<2||snapshot.teamCount>6||!object(snapshot.students)){
      throw new Error("체육 설정의 팀 수 또는 학생 데이터 형식이 올바르지 않습니다.");
    }
    const ids=new Set(roster.map(s=>s.id));
    if(ids.size!==roster.length)throw new Error("학급 명단에 중복 학생 ID가 있습니다.");
    const supplied=Object.keys(snapshot.students);
    if(supplied.length!==ids.size||supplied.some(id=>!ids.has(id))){
      throw new Error("체육 설정의 학생 ID가 학급 명단과 일치하지 않습니다.");
    }
    const safeStudents=Object.create(null);
    for(const student of roster){
      const entry=snapshot.students[student.id];
      if(!object(entry)||!object(entry.traits))throw new Error("학생별 체육 설정 형식이 올바르지 않습니다.");
      if(!Number.isInteger(entry.fixedTeam)||entry.fixedTeam<0||entry.fixedTeam>snapshot.teamCount){
        throw new Error("체육 팀 고정 번호가 허용 범위를 벗어났습니다.");
      }
      const traitNames=Object.keys(entry.traits);
      if(traitNames.length!==TRAIT_KEYS.length||traitNames.some(k=>!TRAIT_KEYS.includes(k))){
        throw new Error("체육 5축 능력치의 항목이 올바르지 않습니다.");
      }
      const traits=Object.create(null);
      for(const axis of TRAIT_KEYS){
        const value=entry.traits[axis];
        if(value!==null&&![1,2,3,4].includes(value)){
          throw new Error("체육 5축 능력치에는 미지정 또는 1~4단계만 사용할 수 있습니다.");
        }
        traits[axis]=value;
      }
      safeStudents[student.id]={traits,fixedTeam:entry.fixedTeam};
    }
    return{teamCount:snapshot.teamCount,students:safeStudents};
  }

  function emptyRecord(){return{traits:Object.fromEntries(TRAIT_KEYS.map(key=>[key,null])),fixedTeam:0};}
  function existingSnapshot(){
    // The existing student editor persists traits/fixed teams to a separate key.
    let raw;
    try{raw=localStorage.getItem(PE_KEY)}catch{throw new Error("체육 능력치 저장소를 읽을 수 없습니다.")}
    let stored;
    try{stored=raw?JSON.parse(raw):{}}catch{throw new Error("체육 능력치 저장 데이터가 손상되었습니다. 기존 자료를 보관하고 복구해 주세요.")}
    if(!object(stored))throw new Error("체육 능력치 저장 데이터 형식이 올바르지 않습니다.");
    const teamCount=stored.teamCount===undefined?4:stored.teamCount;
    const records=Object.create(null);
    for(const student of classState.students){
      const record=own(stored,student.id)?stored[student.id]:null;
      const traits=Object.create(null);
      for(const axis of TRAIT_KEYS){
        const value=record?.traits?.[axis];
        traits[axis]=value===undefined?null:value;
      }
      records[student.id]={traits,fixedTeam:record?.fixedTeam===undefined?0:record.fixedTeam};
    }
    return normalizedSnapshot({teamCount,students:records},classState.students);
  }
  function legacyPE(normalized){
    // V1 has no PE snapshot. Reuse settings ONLY for a matching class, ID and name.
    const old=existingSnapshot();
    const sameClass=normalized.className===classState.className;
    const current=new Map(classState.students.map(s=>[s.id,s.name]));
    const next=Object.create(null);
    let kept=0;
    for(const s of normalized.students){
      const match=sameClass&&current.get(s.id)===s.name;
      next[s.id]=match?(old.students[s.id]||emptyRecord()):emptyRecord();
      if(match)kept++;
    }
    return{snapshot:normalizedSnapshot({teamCount:old.teamCount,students:next},normalized.students),kept};
  }
  function backupPayload(){
    const base=buildBackupPayload(classState);
    return{...base,formatVersion:2,peData:existingSnapshot()};
  }
  function parseBackupUnified(text){
    const payload=JSON.parse(text);
    if(!object(payload)||payload.format!==BACKUP_FORMAT)throw new Error("자리배치 매니저 백업 파일 형식이 아닙니다.");
    if(payload.formatVersion!==1&&payload.formatVersion!==2)throw new Error("지원하지 않는 JSON 백업 버전입니다.");
    if(!object(payload.classState))throw new Error("백업에 학급 데이터가 없습니다.");
    const normalized=normalizeCandidateState(payload.classState);
    if(payload.formatVersion===2){
      if(!own(payload,"peData"))throw new Error("통합 백업에 5축 능력치 데이터가 없습니다.");
      return{normalized,peData:normalizedSnapshot(payload.peData,normalized.students),legacy:false,kept:0};
    }
    const old=legacyPE(normalized);
    return{normalized,peData:old.snapshot,legacy:true,kept:old.kept};
  }
  function studentPEStorage(snapshot){
    const data=Object.create(null);
    data.teamCount=snapshot.teamCount;
    for(const [id,student] of Object.entries(snapshot.students)){
      if(id==="__proto__"||id==="constructor"||id==="prototype")throw new Error("지원하지 않는 학생 ID입니다.");
      data[id]={traits:{...student.traits},fixedTeam:student.fixedTeam};
    }
    return JSON.stringify(data);
  }
  function restoreKey(key,prior){
    if(prior===null)localStorage.removeItem(key);
    else localStorage.setItem(key,prior);
    if(localStorage.getItem(key)!==prior)throw new Error("이전 저장 데이터 복원이 확인되지 않았습니다.");
  }
  function atomicWrite(classData,peData,expectedPE){
    // Avoid importing on top of changes from another browser tab.
    const oldClass=localStorage.getItem(CLASS_KEY);
    const oldPE=localStorage.getItem(PE_KEY);
    if(oldPE!==expectedPE)throw new Error("다른 탭에서 체육 설정이 변경되었습니다. 새로고침 후 다시 시도하세요.");
    if(storageRuntime.stale || oldClass!==storageRuntime.lastKnownCanonicalRaw){
      throw new Error("다른 탭에서 학급 데이터가 바뀌었습니다. 새로고침 후 다시 시도하세요.");
    }
    const classRaw=JSON.stringify(classData);
    const peRaw=studentPEStorage(peData);
    let started=false;
    try{
      started=true;
      localStorage.setItem(CLASS_KEY,classRaw);
      if(localStorage.getItem(CLASS_KEY)!==classRaw)throw new Error("학급 데이터 저장 후 확인에 실패했습니다.");
      localStorage.setItem(PE_KEY,peRaw);
      if(localStorage.getItem(PE_KEY)!==peRaw)throw new Error("체육 능력치 저장 후 확인에 실패했습니다.");
      if(!validatePersistentState(JSON.parse(localStorage.getItem(CLASS_KEY))).ok){
        throw new Error("학급 데이터 저장 후 검증에 실패했습니다.");
      }
      normalizedSnapshot(peData,classData.students);
    }catch(error){
      if(started){
        try{restoreKey(CLASS_KEY,oldClass);restoreKey(PE_KEY,oldPE)}
        catch(rollbackError){
          storageRuntime.saveBlocked=true;
          showStorageAlert("복원 중 저장 오류가 발생했고 이전 상태를 완전히 되돌리지 못했습니다. 현재 탭에서 추가 작업을 중단하고 기존 백업을 보관하세요.","error");
          throw new Error("저장 및 되돌리기에 실패했습니다. 기존 백업 파일을 보존하고 새로고침하지 마세요.");
        }
      }
      throw new Error("JSON 복원 실패: "+(error.message||"브라우저 저장 오류")+" (기존 데이터는 되돌렸습니다.)");
    }
  }
  function triggerDownload(payload){
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json;charset=utf-8"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download="자리배치_"+safeFilenamePart(classState.className)+"_"+localDateStamp()+".json";
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function exportUnified(){
    try{
      triggerDownload(backupPayload());
      setTransferStatus("학급 데이터 + 5축 능력치 + 팀 고정 설정을 통합 JSON으로 내보냈습니다.","success");
    }catch(error){setTransferStatus("JSON 내보내기 실패: "+error.message,"error")}
  }
  async function importUnified(file){
    if(!file)return;
    setTransferStatus("학급과 5축 능력치 백업을 확인하는 중입니다.");
    try{
      const expectedPE=localStorage.getItem(PE_KEY);
      if(file.size>MAX_BYTES)throw new Error("백업 파일이 10MB를 초과합니다.");
      const parsed=parseBackupUnified(await file.text());
      const count=parsed.normalized.students.length;
      const warning=parsed.legacy?
        "\n\n주의: 예전 형식(JSON v1)에는 5축 능력치와 팀 고정 정보가 없습니다. 현재 학급과 이름·학생 ID가 일치하는 "+parsed.kept+"명 설정만 보존하고, 나머지는 미지정/고정 해제로 시작합니다. 복원을 진행할까요?":
        "\n\n학급 데이터와 5축 능력치·팀 고정 설정을 함께 교체합니다. 체육 팀 편성 결과는 복원하지 않습니다.";
      if(!confirm("‘"+parsed.normalized.className+"’ 학급 "+count+"명의 데이터를 불러올까요?\n현재 이 브라우저의 학급 및 체육 설정이 교체됩니다."+warning)){
        setTransferStatus("백업 불러오기를 취소했습니다.");return;
      }
      atomicWrite(parsed.normalized,parsed.peData,expectedPE);
      try{sessionStorage.setItem(SUCCESS_KEY,parsed.legacy?"구형 JSON 학급 복원 완료 · 일치 학생의 기존 5축 설정만 보존했습니다.":"통합 JSON 복원 완료 · 5축 능력치와 팀 고정 설정을 함께 복원했습니다.")}catch{}
      // Reload to reconstruct both in-memory stores and the 4-axis scorer.
      window.location.reload();
    }catch(error){
      setTransferStatus("JSON 불러오기 실패: "+error.message,"error");
    }finally{$("importJsonFile").value=""}
  }

  const exportButton=$("exportJson"),importFile=$("importJsonFile");
  if(!exportButton||!importFile)throw new Error("백업·복구 화면을 찾을 수 없습니다.");
  exportButton.onclick=exportUnified;
  importFile.onchange=event=>importUnified(event.target.files?.[0]);
  try{
    const notice=sessionStorage.getItem(SUCCESS_KEY);
    if(notice){sessionStorage.removeItem(SUCCESS_KEY);setTransferStatus(notice,"success")}
  }catch{}
})();
