"use client";
import { useCallback, useEffect, useState } from "react";
import styles from "./ModelLaboratoryWorkspace.module.css";
const API = "http://127.0.0.1:8000/api/v1";
type Dataset = {name:string; classes:{name:string;image_count:number}[];class_count:number;image_count:number;ready:boolean};
type Experiment = {id:string;dataset_name:string;status:string;results:Record<string,any>;error?:string|null};
type CancerProgram = {id:string;name:string;dataset_name:string|null;image_count:number;class_count:number;ready:boolean;status:string};
const fmt=(v:unknown)=>typeof v==="number"?v.toLocaleString(undefined,{maximumFractionDigits:4}):String(v??"—");
export default function ModelLaboratoryWorkspace(){
 const [datasets,setDatasets]=useState<Dataset[]>([]),[experiments,setExperiments]=useState<Experiment[]>([]),[programs,setPrograms]=useState<CancerProgram[]>([]),[dataset,setDataset]=useState(""),[epochs,setEpochs]=useState(5),[batch,setBatch]=useState(8),[lr,setLr]=useState("0.001"),[loading,setLoading]=useState(true),[starting,setStarting]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const refresh=useCallback(async()=>{try{const [a,b,c]=await Promise.all([fetch(`${API}/model-laboratory/datasets`,{cache:"no-store"}),fetch(`${API}/model-laboratory/experiments`,{cache:"no-store"}),fetch(`${API}/model-laboratory/programs`,{cache:"no-store"})]);const x=await a.json(),y=await b.json(),z=await c.json();if(!a.ok)throw Error(x.detail||"Dataset request failed");if(!b.ok)throw Error(y.detail||"Experiment request failed");if(!c.ok)throw Error(z.detail||"Cancer programme request failed");const ds:Dataset[]=x.datasets||[];setDatasets(ds);setExperiments(y.experiments||[]);setPrograms(z.programs||[]);if(!dataset&&ds.some(d=>d.ready))setDataset(ds.find(d=>d.ready)!.name);}catch(e){setError(e instanceof Error?e.message:"API connection failed");}finally{setLoading(false);}},[dataset]);
 useEffect(()=>{void refresh();},[refresh]);
 useEffect(()=>{if(!experiments.some(e=>["queued","running"].includes(e.status)))return;const id=window.setInterval(()=>void refresh(),3000);return()=>window.clearInterval(id);},[experiments,refresh]);
 async function train(){setStarting(true);setError("");setMessage("");try{const r=await fetch(`${API}/model-laboratory/train`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dataset_name:dataset,epochs,batch_size:batch,learning_rate:Number(lr),seed:42})});const p=await r.json();if(!r.ok)throw Error(p.detail||"Could not start training");setMessage(`Training queued · ${p.experiment_id}`);await refresh();}catch(e){setError(e instanceof Error?e.message:"Training could not start");}finally{setStarting(false);}}
 async function trainReady(){
  setStarting(true);setError("");setMessage("");
  try{
   const r=await fetch(`${API}/model-laboratory/train-ready`,{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({epochs:3,batch_size:8,learning_rate:0.001,seed:42})
   });
   const p=await r.json();
   if(!r.ok)throw Error(p.detail||"Could not queue ready cancer models");
   setMessage(`${p.queued_count} cancer training experiment(s) queued. Training will run sequentially.`);
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:"Batch training could not start");}
  finally{setStarting(false);}
 }
 return <main className={styles.workspace}>
  <header className={styles.header}><div><div className={styles.eyebrow}>MODULE 11 / EXPERIMENTAL MACHINE LEARNING</div><h1>Training &amp; Model Laboratory</h1><p>Configure reproducible image-classification experiments, train PyTorch models and inspect measured results.</p></div><button onClick={()=>void refresh()} className={styles.secondary}>Refresh</button></header>
  <section className={styles.notice}><b>Research integrity notice</b><span>Training uses your labelled images and reports measured results only. Image-level splits do not guarantee patient-level separation. This experimental model is not for clinical use.</span></section>
  <section className={styles.hardware}><article><small>FRAMEWORK</small><b>PyTorch</b><span>Gradient-based training</span></article><article><small>ACCELERATION</small><b>Apple MPS</b><span>Used when available; otherwise CPU</span></article><article><small>ARCHITECTURE</small><b>SmallCNN v1</b><span>Baseline convolutional classifier</span></article><article><small>INPUT</small><b>128 × 128 RGB</b><span>Resize and channel normalization</span></article></section>
  <section className={styles.panel}>
   <div className={styles.panelHead}>
    <div><small>10-CANCER PROGRAMME</small><h2>Multi-Cancer AI Training Engine</h2></div>
    <span>{programs.filter(p=>p.ready).length} / 10 ready</span>
   </div>
   <p>Each cancer programme uses its own labelled dataset and independent experiment. Missing datasets are not replaced with fabricated data.</p>
   <div className={styles.hardware}>
    {programs.map(p=><article key={p.id}>
     <small>{p.id.toUpperCase()}</small><b>{p.name}</b>
     <span>{p.dataset_name ? `${p.image_count.toLocaleString()} images · ${p.class_count} classes` : "No dataset installed"}</span>
     <span>{p.status}</span>
    </article>)}
   </div>
   <div className={styles.actions}>
    <button className={styles.primary} disabled={!programs.some(p=>p.ready)||starting} onClick={()=>void trainReady()}>
     {starting?"Queueing…":"Train All Ready Models"}
    </button>
    <span>3 epochs · batch size 8 · sequential execution</span>
   </div>
  </section>
  {error&&<div className={styles.error}>{error}</div>}{message&&<div className={styles.message}>{message}</div>}
  <section className={styles.panel}><div className={styles.panelHead}><div><small>01 / DATASET DISCOVERY</small><h2>Available labelled datasets</h2></div><span>{datasets.length} found</span></div><p>Put images into class-named folders inside <code>data/datasets/</code>. Every class needs at least two readable images.</p><pre>{`data/datasets/your_dataset/\n├── class_one/  (images)\n└── class_two/  (images)`}</pre>
   {loading?<p>Scanning datasets…</p>:datasets.length===0?<div className={styles.empty}>No datasets found. Create the folder structure above, add a labelled research dataset, then refresh.</div>:datasets.map(d=><div className={styles.dataset} key={d.name}><b>{d.name}</b><span>{d.class_count} classes · {d.image_count} images · {d.ready?"Ready":"Needs more images"}</span><small>{d.classes.map(c=>`${c.name}: ${c.image_count}`).join(" · ")}</small></div>)}
  </section>
  <section className={styles.panel}><div className={styles.panelHead}><div><small>02 / EXPERIMENT CONFIGURATION</small><h2>Start a training run</h2></div></div><div className={styles.form}>
   <label>Dataset<select value={dataset} onChange={e=>setDataset(e.target.value)}><option value="">Select ready dataset</option>{datasets.filter(d=>d.ready).map(d=><option key={d.name} value={d.name}>{d.name} · {d.image_count} images</option>)}</select></label>
   <label>Epochs<input type="number" min="1" max="50" value={epochs} onChange={e=>setEpochs(Math.max(1,Math.min(50,Number(e.target.value))))}/></label>
   <label>Batch size<select value={batch} onChange={e=>setBatch(Number(e.target.value))}>{[4,8,16,32,64].map(n=><option key={n}>{n}</option>)}</select></label>
   <label>Learning rate<input type="number" min="0.000001" max="0.1" step="0.0001" value={lr} onChange={e=>setLr(e.target.value)}/></label>
  </div><div className={styles.actions}><button className={styles.primary} disabled={!dataset||starting} onClick={()=>void train()}>{starting?"Starting…":"Start real training"}</button><span>Seed 42 · Per-class random split · Random initial weights</span></div></section>
  <section className={styles.panel}><div className={styles.panelHead}><div><small>03 / EXPERIMENT TRACKING</small><h2>Training history</h2></div><span>{experiments.length} experiments</span></div>
   {experiments.length===0?<div className={styles.empty}>No experiments yet. Add a labelled dataset and start your first run.</div>:experiments.map(e=><article className={styles.experiment} key={e.id}><div className={styles.experimentHead}><b>{e.dataset_name}</b><span>{e.status}</span></div><small>{e.id}</small>{e.error&&<p className={styles.error}>{e.error}</p>}{e.results?.history?.length>0&&<><div className={styles.metrics}><div><small>Validation accuracy</small><b>{fmt((e.results.final_validation_accuracy??e.results.history.at(-1).validation_accuracy)*100)}%</b></div><div><small>Validation loss</small><b>{fmt(e.results.final_validation_loss??e.results.history.at(-1).validation_loss)}</b></div><div><small>Device</small><b>{fmt(e.results.device)}</b></div><div><small>Epochs</small><b>{fmt(e.results.completed_epochs)} / {fmt(e.results.total_epochs)}</b></div></div><div className={styles.table}><div className={styles.row}><b>Epoch</b><b>Train loss</b><b>Train acc.</b><b>Val. loss</b><b>Val. acc.</b></div>{e.results.history.map((h:any)=><div className={styles.row} key={h.epoch}><span>{h.epoch}</span><span>{fmt(h.train_loss)}</span><span>{fmt(h.train_accuracy*100)}%</span><span>{fmt(h.validation_loss)}</span><span>{fmt(h.validation_accuracy*100)}%</span></div>)}</div><p className={styles.caution}>{e.results.metrics_note}</p></>}</article>)}
  </section><footer>CYTOGENIX · Experimental biomedical research platform · Not for clinical diagnosis or patient management</footer>
 </main>;
}
