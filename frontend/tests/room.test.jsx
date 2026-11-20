// @vitest-environment jsdom
import React from 'react'
import {afterEach,beforeEach,expect,test,vi} from 'vitest'
import {render,screen,fireEvent,cleanup} from '@testing-library/react'
import {MemoryRouter,Route,Routes} from 'react-router-dom'
import {Room} from '../src/Interview'
import {Auth} from '../src/Public'

const first={id:'session',deadline:Math.floor(Date.now()/1000)+600,turns:[{id:'turn',position:1,question:'Describe your project.'}],config:{count:5,mode:'Voice'},context:{target:{role:'Engineer'}}}
let requests
function response(body,status=200){return Promise.resolve({ok:status<400,status,json:async()=>body})}
function renderRoom(){render(<MemoryRouter initialEntries={['/room/session']}><Routes><Route path="/room/:id" element={<Room/>}/></Routes></MemoryRouter>)}
beforeEach(()=>{
 requests=[]
 vi.stubGlobal('fetch',vi.fn((url,args)=>{
  requests.push({url,args})
  if(url.endsWith('/answer'))return response({...first,turns:[...first.turns,{id:'turn2',position:2,question:'How did you compare alternatives?'}]})
  if(url.endsWith('/transcribe'))return response({id:'recording',text:'I compared alternatives.',metrics:{words_per_minute:80,seconds:3}})
  return response(first)
 }))
})
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks()})
test('capture, stop microphone tracks, review transcript, submit edit and render next question',async()=>{
 const stop=vi.fn()
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:vi.fn(async()=>({getTracks:()=>[{stop}]}))}})
 class Recorder {
  static isTypeSupported(){return true}
  constructor(stream){this.stream=stream;this.mimeType='audio/webm'}
  start(){this.state='recording'}
  stop(){this.state='inactive';this.ondataavailable({data:new Blob(['test'])});this.onstop()}
 }
 vi.stubGlobal('MediaRecorder',Recorder)
 renderRoom()
 fireEvent.click(await screen.findByRole('button',{name:'Record answer'}))
 fireEvent.click(await screen.findByRole('button',{name:'Stop & transcribe'}))
 const field=await screen.findByDisplayValue('I compared alternatives.')
 expect(stop).toHaveBeenCalled()
 fireEvent.change(field,{target:{value:'I compared query latency.'}})
 fireEvent.click(screen.getByRole('button',{name:'Submit answer'}))
 await screen.findByText('How did you compare alternatives?')
 const submission=JSON.parse(requests.find(r=>r.url.endsWith('/answer')).args.body)
 expect(submission).toEqual({turn_id:'turn',text:'I compared query latency.',recording_id:'recording'})
})
test('microphone denied still allows a typed answer',async()=>{
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:vi.fn(async()=>{throw new Error('Permission denied')})}})
 vi.stubGlobal('MediaRecorder',class {})
 renderRoom()
 fireEvent.click(await screen.findByRole('button',{name:'Record answer'}))
 await screen.findByRole('alert')
 fireEvent.click(screen.getByRole('button',{name:'Text',exact:true}))
 fireEvent.change(screen.getByLabelText('Your answer'),{target:{value:'I used indexes.'}})
 fireEvent.click(screen.getByRole('button',{name:'Submit answer'}))
 await screen.findByText('How did you compare alternatives?')
 expect(JSON.parse(requests.at(-1).args.body).recording_id).toBeNull()
})
test('registration sends confirmation and enters the dashboard',async()=>{
 const onLogin=vi.fn()
 render(<MemoryRouter initialEntries={['/signup']}><Routes><Route path="/signup" element={<Auth mode="signup" onLogin={onLogin}/>}/><Route path="/studio" element={<h1>Dashboard</h1>}/></Routes></MemoryRouter>)
 for(const [label,value] of [['Full name','Test Candidate'],['Email address','user@example.test'],['Password','local-test-pass'],['Confirm password','local-test-pass']]){
  fireEvent.change(screen.getByLabelText(label,{exact:true}),{target:{value}})
 }
 fireEvent.click(screen.getByRole('button',{name:'Create account'}))
 await screen.findByText('Dashboard')
 expect(onLogin).toHaveBeenCalled()
 expect(requests[0].url).toBe('/api/auth/register')
})
