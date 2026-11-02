#!/usr/bin/env python3
"""Natural English hackathon narration. Synthetic/recorded data disclosed accurately."""
import asyncio,json,sys
from pathlib import Path
import edge_tts

# Timings are intentionally separated to synchronize to browser evidence chapters.
# Intro / PDF-assisted registration / actual Meta response replay / Jiptok / title review.
BEATS=[
 (0.0,"Welcome to DirectHome, a more thoughtful way to list a home and keep track of what people have actually agreed."),
 (7.0,"The owner begins with an educational registry PDF. Instead of manually typing every detail, DirectHome offers an editable draft: an address, unit information, and floor area. This example uses fictional data, not official ownership verification."),
 (24.0,"The extracted fields appear directly in the listing form. The owner can review and correct them before entering a deposit and monthly rent."),
 (34.0,"Now the owner adds a photo of a Korean apartment living room. These picture-based suggestions come from a previously captured, genuine Meta Muse Spark response."),
 (46.0,"Muse Spark recognized a living room and identified the floor standing air conditioner. DirectHome turns this visible item into a suggested amenity, which the owner must actively choose before it becomes part of the listing."),
 (60.0,"Next, Muse Image creates a furniture free view of that same photo. The result looks natural, but it is clearly a virtual illustration. It is not a promise about the room's hidden surfaces or its actual physical condition."),
 (75.0,"The owner reviews the listing before saving. Nothing is published or agreed automatically."),
 (80.0,"Next, meet Jiptok, the neutral deal companion. It follows the conversation between the owner and visitor, then organizes concrete proposals, confirmed conditions, and the steps that still need attention. It does not bargain on anyone's behalf."),
 (96.0,"Here the proposed deposit and monthly rent appear in a versioned confirmation card. A proposal alone is not an agreement."),
 (107.0,"After one participant agrees, Jiptok still shows the other person's approval is pending."),
 (116.0,"Only when both parties confirm the same version does the status change. The assistant can then guide them toward visits, independent checks, and contract preparation, without signing for either party."),
 (125.0,"Finally, DirectHome opens an educational registry PDF locally in the browser. The fictional example contains a provisional seizure entry and two registered mortgages. No private document is sent to an external model during this check."),
 (141.0,"The system extracts candidate rights from the document's text layer, including dates and maximum secured amounts. Each candidate remains unverified until the user compares it with the original and chooses what to carry into the checklist."),
 (157.0,"The final review highlights registered liens and the other questions that still need answers: prior tenants, unpaid taxes, and the authority to sign. It never labels this property legally safe."),
 (170.0,"DirectHome. AI helps organize. People remain in control."),
]
async def main():
 output=Path(sys.argv[1]);output.mkdir(parents=True,exist_ok=True)
 voice="en-US-AvaNeural";items=[]
 for i,(start,text) in enumerate(BEATS):
  path=output/("voice_%02d.mp3"%i)
  # Natural neural voice, not the old robotic eSpeak.
  await edge_tts.Communicate(text=text,voice=voice,rate="+5%").save(str(path))
  items.append({"index":i,"start":start,"text":text,"file":path.name})
  print("NARRATION",i,"START",start,"BYTES",path.stat().st_size,flush=True)
 (output/"voice-cues.json").write_text(json.dumps({"voice":voice,"segments":items},indent=2),encoding="utf8")
asyncio.run(main())
