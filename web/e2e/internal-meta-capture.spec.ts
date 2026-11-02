import {test,expect} from "@playwright/test";

test("one-shot real Meta capture never activates in test or without privileged operator token",async({request})=>{
 const input={feature:"generate",consent:true};
 const ordinary=await request.post("/api/internal/meta-evidence",{data:input});
 expect(ordinary.status()).toBe(404);
 expect((await ordinary.json()).error).toBe("not_found");
 const counterfeit=await request.post("/api/internal/meta-evidence",{
  headers:{"x-directhome-demo-token":"ordinary-user-token","Content-Type":"application/json"},
  data:{feature:"vision",consent:true,image:"data:image/jpeg;base64,invalid"},
 });
 expect(counterfeit.status()).toBe(404);
});
