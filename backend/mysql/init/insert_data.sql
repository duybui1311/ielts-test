INSERT INTO cases (title, body_md, tags, created_by)
VALUES
(
  'Acute chest pain in a 54-year-old man',
  '## Presenting complaint
A 54-year-old man presents to the emergency department with 45 minutes of central chest pain radiating to the left arm.

## History
- Pain started at rest while watching TV
- Described as a heavy, crushing sensation
- Associated with nausea and shortness of breath
- Past medical history: hypertension, hyperlipidaemia, smoker (20 pack-years)

## Examination
- Appears anxious and diaphoretic
- HR 104 bpm, BP 150/90 mmHg, RR 22, SpO2 95% on room air
- Heart sounds dual, no murmurs
- Lungs clear

## Key tasks for the student
- Take a focused chest pain history
- Perform a targeted cardiovascular examination
- Explain initial investigations and management for suspected ACS.',
  JSON_ARRAY('cardiology','acute','chest pain','myocardial infarction'),
  1
),
(
  'Asthma exacerbation in a 22-year-old woman',
  '## Presenting complaint
A 22-year-old woman presents with worsening shortness of breath and wheeze.

## History
- Known asthma since childhood
- Increased use of salbutamol inhaler over past 3 days
- Night-time symptoms, difficulty completing full sentences
- Triggered after a viral upper respiratory infection

## Examination
- RR 26, HR 110 bpm, BP 118/70 mmHg, SpO2 93% on room air
- Using accessory muscles of respiration
- Diffuse expiratory wheeze on auscultation

## Key tasks for the student
- Take an asthma control and exacerbation history
- Assess severity of the attack
- Explain acute management and preventive strategies.',
  JSON_ARRAY('respiratory','asthma','shortness of breath','acute'),
  1
),
(
  'Diabetic ketoacidosis in a 19-year-old student',
  '## Presenting complaint
A 19-year-old university student presents with abdominal pain, vomiting, and drowsiness.

## History
- Type 1 diabetes diagnosed at age 14
- Missed multiple insulin doses over the past week
- Polyuria, polydipsia, weight loss
- No recent infections reported

## Examination
- Appears dehydrated, drowsy but rousable
- HR 120 bpm, BP 100/60 mmHg, RR 28 with deep Kussmaul breathing
- Fruity (acetone) smell on breath

## Key tasks for the student
- Take a focused history for suspected DKA
- Explain pathophysiology in simple terms
- Outline initial investigations and fluid/insulin management.',
  JSON_ARRAY('endocrine','diabetes','DKA','emergency'),
  1
),
(
  'Right lower quadrant abdominal pain in a 17-year-old boy',
  '## Presenting complaint
A 17-year-old boy presents with 18 hours of worsening right lower quadrant abdominal pain.

## History
- Pain started peri-umbilically then migrated to the right iliac fossa
- Associated with low-grade fever and nausea
- Anorexia, no bowel movements in 24 hours
- No urinary symptoms

## Examination
- T 37.9°C, HR 96 bpm, BP 118/72 mmHg
- Localised tenderness in right iliac fossa with rebound
- Positive Rovsing''s sign

## Key tasks for the student
- Take a focused abdominal pain history
- Perform an abdominal examination
- Discuss likely diagnosis (appendicitis) and need for surgery.',
  JSON_ARRAY('surgery','gastrointestinal','appendicitis','abdominal pain'),
  1
),
(
  'Low mood and poor sleep in a 32-year-old office worker',
  '## Presenting complaint
A 32-year-old office worker presents with low mood and fatigue for 2 months.

## History
- Loss of interest in previously enjoyable activities
- Early morning wakening and poor appetite
- Difficulty concentrating at work
- No history of manic symptoms, psychosis, or substance abuse
- No active suicidal plan but occasional thoughts of ''not wanting to wake up''

## Examination
- Appears tearful but cooperative
- Normal physical examination

## Key tasks for the student
- Take a sensitive mental health history
- Screen for risk of self-harm and suicide
- Explain initial management options for moderate depression.',
  JSON_ARRAY('psychiatry','depression','mental health','communication'),
  1
),
(
  'Wrist pain after a fall in a 26-year-old cyclist',
  '## Presenting complaint
A 26-year-old cyclist presents with pain and swelling of the right wrist after falling onto an outstretched hand.

## History
- Immediate pain and difficulty moving the wrist
- No head injury or loss of consciousness
- Right-hand dominant, works as a graphic designer

## Examination
- Visible swelling around the distal radius
- Tenderness over the radial aspect and anatomical snuffbox
- Pain with wrist movement, neurovascular status intact distally

## Key tasks for the student
- Take a trauma-focused history
- Perform a musculoskeletal examination of the wrist
- Explain need for imaging and potential fractures (e.g. distal radius, scaphoid).',
  JSON_ARRAY('orthopaedics','fracture','trauma','musculoskeletal'),
  1
);