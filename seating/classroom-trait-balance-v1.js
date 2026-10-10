"use strict";
/*
  Seating Manager V1.00 — classroom grouping trait balance
  - Replaces ONLY the legacy A/B/C groupBalanceScore scorer.
  - Keeps all Seating Studio candidate validation and priority ordering intact.
  - Reads the existing PE/Seating shared five-trait record WITHOUT writing to it.
  - Classroom axes: leadership, intelligence, charm, initiative (not stamina).
  - Null/missing/invalid values remain UNASSIGNED, never level 2.
*/
(()=>{
  const STORAGE_KEY="teacher-tools.seating.pe-prototype.v2";
  const AXES=["leadership","intelligence","charm","initiative"];
  const LEVELS=[1,2,3,4];
  let lastRaw, cached={};

  function readPrivateTraits(){
    let raw;
    try{raw=localStorage.getItem(STORAGE_KEY)}catch{return{}}
    if(raw===lastRaw)return cached;
    lastRaw=raw;
    try{
      const parsed=raw?JSON.parse(raw):{};
      cached=parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed:{};
    }catch{cached={}}
    return cached;
  }

  function classroomGroupFourAxisScore(assignments){
    if(!Array.isArray(assignments)||!classState.groups.length)return 0;

    const studentsById=new Map(classState.students.map(s=>[s.id,s]));
    const assignmentBySeat=new Map(assignments.map(a=>[a.seatId,a.studentId]));
    const privateState=readPrivateTraits();

    const groups=classState.groups.map(group=>{
      const members=[];
      for(const seatId of group.seatIds||[]){
        const studentId=assignmentBySeat.get(seatId);
        if(studentsById.has(studentId))members.push(studentId);
      }
      return members;
    });
    const totalGrouped=groups.reduce((sum,members)=>sum+members.length,0);
    if(!totalGrouped)return 0;

    let score=0;
    // Each axis is evaluated independently, with equal importance.
    for(const axis of AXES){
      const counts=groups.map(members=>{
        const histogram=[0,0,0,0];
        for(const studentId of members){
          const value=privateState[studentId]?.traits?.[axis];
          if(LEVELS.includes(value))histogram[value-1]++;
        }
        return{size:members.length,histogram,known:histogram.reduce((a,b)=>a+b,0)};
      });
      const allLevels=[0,0,0,0];
      for(const entry of counts)for(let level=0;level<4;level++)allLevels[level]+=entry.histogram[level];
      const allKnown=allLevels.reduce((a,b)=>a+b,0);
      if(!allKnown)continue; // Entirely unspecified axis: not an average.

      for(const group of counts){
        if(!group.size)continue;
        // Balanced coverage of *rated* pupils; unrated pupils are not assigned a fake rating.
        const expectedKnown=allKnown*group.size/totalGrouped;
        const coverageGap=group.known-expectedKnown;
        score+=4*coverageGap*coverageGap/Math.max(1,expectedKnown);

        // Balance the four rating categories independently, normalized for group size.
        for(let level=0;level<4;level++){
          const expected=group.known*allLevels[level]/allKnown;
          const gap=group.histogram[level]-expected;
          score+=6*gap*gap/Math.max(1,group.known);
        }
      }
    }
    return Number.isFinite(score)?score:0;
  }

  // app.js invokes this global scorer only after mandatory seat constraints
  // (fixed, gender-seat, apart-pair) pass. Its priority tuple is unchanged.
  groupBalanceScore=classroomGroupFourAxisScore;
})();