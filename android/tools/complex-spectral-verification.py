"""Conservative subsequence-DTW verification for phase/edited-take mismatches.
Full official verse acoustics, two already verified neighbouring controls, a
reversed negative control and an independent raw waveform anchor are required.
No language model or generated Quran text/audio is used.
"""
import numpy as np
from scipy.signal import stft
SR=4000;HOP=80;WINDOW=160
F=np.linspace(0,SR/2,129)
E=700*(10**(np.linspace(2595*np.log10(1+80/700),2595*np.log10(1+1900/700),26)/2595)-1)
W=np.maximum(0,np.minimum((F[None,:]-E[:-2,None])/(E[1:-1,None]-E[:-2,None]),(E[2:,None]-F[None,:])/(E[2:,None]-E[1:-1,None])))
def features(a):
 _,_,z=stft(a,fs=SR,nperseg=WINDOW,noverlap=WINDOW-HOP,nfft=256,boundary=None,padded=False)
 x=np.log(np.maximum(W@(abs(z)**2),1e-12));return x.T.astype(np.float32)
def locate(audio,clip):
 A=features(clip);B=features(audio);assert len(A)*len(B)<=20000000,'Spectral verification window too large'
 centre=A.mean(axis=0,keepdims=True);A=A-centre;B=B-centre
 A-=A.mean(axis=1,keepdims=True);B-=B.mean(axis=1,keepdims=True)
 A/=np.maximum(np.sqrt((A*A).sum(axis=1,keepdims=True)),1e-8);B/=np.maximum(np.sqrt((B*B).sum(axis=1,keepdims=True)),1e-8)
 C=np.clip(1-A@B.T,0,2)
 D=np.empty_like(C);previous=np.zeros(C.shape[1],np.float32)
 for i in range(len(A)):
  prefix=np.cumsum(C[i]);p=np.minimum(previous,np.r_[np.inf,previous[:-1]]);row=prefix+np.minimum.accumulate(p-np.r_[0,prefix[:-1]]);D[i]=row;previous=row
 i=len(A)-1;j=int(np.argmin(D[-1]));end=j;path=[]
 while i>=0:
  path.append((i,j))
  if i==0:break
  candidates=[(D[i-1,j-1],i-1,j-1)] if j>0 else []
  candidates.append((D[i-1,j],i-1,j))
  if j>0:candidates.append((D[i,j-1],i,j-1))
  _,i,j=min(candidates)
 similarity=np.array([1-C[i,j] for i,j in path])
 return dict(mean=float(similarity.mean()),p10=float(np.percentile(similarity,10)),median=float(np.median(similarity)),start=j*HOP/SR,end=(end*HOP+WINDOW)/SR,ratio=(end-j+1)/len(A),path=path)
def verify(m,audio,clips,known,verse):
 ordinary=[v for v in known if not known[v].get('verification','').startswith('spectral-dtw')];assert len(ordinary)>=2,'Two independently verified controls required'
 left=max((v for v in ordinary if v<verse),default=None);right=min((v for v in ordinary if v>verse),default=None)
 neighbours=sorted(ordinary,key=lambda v:abs(v-verse))[:8]
 clip=m.pcm(clips[verse]);st,en=m.activity(clip);lo=max(0,round(known[left]['start']/1000*SR)) if left else 0;hi=min(len(audio),round(known[right]['start']/1000*SR)) if right else len(audio)
 result=locate(audio[lo:hi],clip[st:en]);assert result['mean']>=.85 and result['p10']>=.65 and result['median']>=.85 and .8<=result['ratio']<=1.25,('spectral confidence',verse,{k:v for k,v in result.items() if k!='path'})
 negative=locate(audio[lo:hi],clip[st:en][::-1]);assert result['mean']-negative['mean']>=.12,'Insufficient negative-control separation'
 controls=[]
 for v in neighbours:
  a=m.pcm(clips[v]);cs,ce=m.activity(a);start=known[v]['start']/1000;c0=max(0,round((start-1)*SR));c1=min(len(audio),round((start+len(a)/SR+2)*SR));r=locate(audio[c0:c1],a[cs:ce]);error=abs((r['start']+c0/SR)*1000-known[v]['start'])
  if r['mean']>=.85 and error<=150:controls.append(dict(verse=v,mean=r['mean'],startErrorMs=error))
  if len(controls)==2:break
 assert len(controls)==2,'Two suitable independent positive controls required'
 assert result['mean']>=min(r['mean'] for r in controls)-.03,'Candidate below trusted positive controls'
 length=min(int(.4*SR),max(int(.2*SR),(en-st)//4));target=audio[lo:hi]
 from scipy.ndimage import map_coordinates
 def prove_anchor(anchor):
  frame=round((anchor-st-WINDOW/2)/HOP);matches=[j for i,j in result['path'] if abs(i-frame)<=1]
  if not matches:return None
  predicted=(float(np.median(matches))*HOP+WINDOW/2)/SR;part=clip[anchor:anchor+length].astype(float);best=None
  for scale in np.arange(.975,1.02501,.0005):
   needle=map_coordinates(part,[np.arange(round(len(part)*scale))/scale],order=3,mode='nearest',prefilter=True)
   for polarity in [1,-1]:
    off,score=m.match_anchor(target,needle*polarity,0,len(needle),max(0,round((predicted-.12)*SR)),min(len(target),round((predicted+.12)*SR)+len(needle)))
    error=abs(off/SR-predicted)*1000
    if error<=120 and (best is None or score>best['score']):best=dict(referenceMs=round((anchor-st)*1000/SR),score=score,pathErrorMs=error,localScale=float(scale),polarity=polarity)
  if best and best['score']<.85:
   centre=best['localScale']
   for scale in np.arange(max(.975,centre-.001),min(1.025,centre+.001)+.00001,.0001):
    for phase in [-.5,-.25,.25,.5]:
     needle=map_coordinates(part,[np.arange(round(len(part)*scale))/scale+phase],order=3,mode='nearest',prefilter=True)
     off,score=m.match_anchor(target,needle,0,len(needle),max(0,round((predicted-.12)*SR)),min(len(target),round((predicted+.12)*SR)+len(needle)))
     error=abs(off/SR-predicted)*1000
     if error<=120 and score>best['score']:best=dict(referenceMs=round((anchor-st)*1000/SR),score=score,pathErrorMs=error,localScale=float(scale),fractionalPhase=float(phase))
  return best
 anchors=[];active=en-st
 for start,end in [(st,min(en-length,st+int(3*SR))),(st+active//3,st+active*2//3-length),(st+active*2//3,en-length)]:
  points=range(start,max(start+1,end+1),int(.1*SR));ranked=sorted(points,key=lambda t:float(np.dot(clip[t:t+length],clip[t:t+length])),reverse=True);spaced=[];proofs=[];attempts=[]
  for point in ranked:
   if all(abs(point-old)>=length//2 for old in spaced):spaced.append(point)
   if len(spaced)>=12:break
  for point in spaced:
   proof=prove_anchor(point)
   if proof:attempts.append(proof)
   if proof and proof['score']>=.85:proofs.append(proof)
  assert proofs,('independent raw anchor band',verse,start/SR,end/SR,max(attempts,key=lambda a:a['score']) if attempts else None)
  anchors.append(max(proofs,key=lambda x:x['score']))
 assert anchors[-1]['referenceMs']-anchors[0]['referenceMs']>=active*1000/SR*.5,'Insufficient independent anchor span'
 score=min(a['score'] for a in anchors);error=max(a['pathErrorMs'] for a in anchors)

 start=round((lo/SR+result['start'])*1000);assert (left is None or known[left]['start']<start) and (right is None or start<known[right]['start'])
 return dict(verse=verse,start=start,clipSha256=m.hashlib.sha256(clips[verse]).hexdigest(),verification='spectral-dtw-three-anchors',spectralMean=result['mean'],spectralP10=result['p10'],spectralMedian=result['median'],durationRatio=result['ratio'],negativeMean=negative['mean'],rawAnchorScore=score,rawAnchorPathErrorMs=error,controls=controls,frameResolutionMs=20,rawAnchors=anchors,activeDurationMs=round(active*1000/SR))
