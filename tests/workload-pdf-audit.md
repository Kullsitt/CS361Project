# Workload dropdown audit

Reference: the user-supplied, 16-page `01 แบบฟอร์มกรอกภาระงาน 2-2567-ppr-submitted.pdf`.
Reviewed text and rendered pages; the submitted person's entries are not application defaults.

## Coverage

- Teaching: 1.1–1.11, pages 2–4. Undergraduate lecture enrollment remains a numeric input, not a role. Graduate lecture weight is fixed at 1.1 by default. Project examiners (1.4) and cooperative-education work reviewers (1.5) have different labels.
- Academic: 2.1–2.10 including every printed subcategory, pages 6–11. Dropdowns distinguish funding type, publication type/Quartile, presentation format, intellectual property, books/chapters, teaching materials, grant budget bands, awards and utilization.
- Administration: 3.1–3.5, pages 12–13. Evaluated weights are blank until entered. Section 3.2 takes evaluated **points**, not a weight multiplied by 200. Section 3.3 option 4 is an additional entry for enrollment above 300, not a replacement for the main coordinator role. Section 3.5 permits one entry per role per semester/year.
- Service: 4.1.1, 4.2.1, 4.2.2, 4.3–4.6, pages 14–16. Includes the outside-faculty administrative position and all four public-service alternatives.
- Generic “other” alternatives were removed from PDF-defined dropdowns. Each category has main type → subtype → role/type dropdowns. The UI has no weight/formula input: scores are derived from the selected role and actual work data and displayed read-only.
- Student names appear only for student-related work: teaching/advising projects, theses, student-advisor awards/competitions, general/PostMaster/PostDoc advising and outside-university thesis advising/examining. Multiple names are accepted on separate lines. Cooperative education and seminars at both undergraduate and graduate levels exclude student names per the user's request.

## Source gaps and boundaries

- Section 2.5 option 4 is clipped at the bottom of page 8 and is not recovered on page 9. Its label/weight are unknown. A disabled placeholder preserves the visible numbering; no value is inferred.
- Category 5 appears only in the summary on page 1 (cap 100); no role/rate table appears in the file. The category is shown but cannot be submitted or scored until criteria are supplied.
- Tier 1 in 2.3.1 says “100%”, while 2.3.2 says “10%”. Preserve the printed weights without silently interpreting/correcting the percentages.
- Variable evaluator ranges in 3.1 and 3.2 remain documented in the rule metadata. These roles show “รอประเมิน” and can be saved with a null score; instructors cannot enter/override evaluator points. The fixed management-committee role still calculates automatically.
- Scores remain raw per-record values. Subcategory/category/overall caps, eligibility checks, cross-record award exclusivity, lab-section requirements and formal approval are not a complete assessment engine. Relevant PDF conditions are retained in rule metadata; calculation details are hidden from the form as requested.
- The dates, free-text description and reference-number inputs intentionally remain removed per the user's earlier instruction.

## Validation

Run `node tests/workload-scoring.cjs`: compares all 40 subtype tables against 116 printed/supported alternatives (including one unavailable placeholder), checks hierarchy reachability, student-name applicability, automatic scores (ignoring injected weights), pending assessments, source gaps, sample scores and invalid values.
