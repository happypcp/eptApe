import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  coupons,
  exams,
  examVersions,
  mockTestQuestions,
  mockTests,
  questions,
  questionTypes,
  sections,
  subscriptionPlans,
} from '../db/schema.ts';
import { EXAM_LIST } from '../shared/examSpecs.ts';

interface SeedQuestionDef {
  externalCode: string;
  examCode: string;
  sectionCode: string;
  typeCode: string;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  topic: string;
  promptText: string;
  stimulusJson: Record<string, unknown>;
  mediaJson: Record<string, unknown>;
  answerKeyJson: Record<string, unknown>;
  acceptedVariantsJson?: string[];
  explanation: string;
  scoringConfigJson?: Record<string, unknown>;
}

export const ORIGINAL_QUESTIONS: SeedQuestionDef[] = [
  // ===================== PTE ACADEMIC =====================
  {
    externalCode: 'PTEA-RA-001',
    examCode: 'pte_academic',
    sectionCode: 'speaking',
    typeCode: 'read_aloud',
    title: 'Urban Microclimates and Canopy Cover',
    difficulty: 'medium',
    topic: 'Environmental Science',
    promptText: 'Look at the text below. In 35 seconds, you must read this text aloud as naturally and clearly as possible.',
    stimulusJson: {
      passage:
        'Metropolitan planners increasingly rely on urban canopy mapping to mitigate localized heat islands. By analyzing thermal satellite imagery alongside pedestrian density, municipalities can prioritize tree-planting corridors that lower ambient street temperatures by up to four degrees Celsius during peak summer afternoons.',
    },
    mediaJson: {},
    answerKeyJson: {
      referenceText:
        'Metropolitan planners increasingly rely on urban canopy mapping to mitigate localized heat islands. By analyzing thermal satellite imagery alongside pedestrian density, municipalities can prioritize tree-planting corridors that lower ambient street temperatures by up to four degrees Celsius during peak summer afternoons.',
    },
    explanation: 'Maintain steady phrasing across clauses ("By analyzing thermal satellite imagery / alongside pedestrian density") and clearly stress multisyllabic academic words like "municipalities" and "prioritize".',
  },
  {
    externalCode: 'PTEA-RS-001',
    examCode: 'pte_academic',
    sectionCode: 'speaking',
    typeCode: 'repeat_sentence',
    title: 'Library Archive Extended Hours',
    difficulty: 'medium',
    topic: 'Campus Life',
    promptText: 'You will hear a sentence. Please repeat the sentence exactly as you hear it. You will hear the sentence only once.',
    stimulusJson: {
      audioScript: 'Graduate researchers may request extended overnight access to the historical manuscript archive through the online portal.',
      maxPlays: 1,
    },
    mediaJson: { ttsType: 'single', voiceName: 'Kore' },
    answerKeyJson: {
      referenceText: 'Graduate researchers may request extended overnight access to the historical manuscript archive through the online portal.',
    },
    explanation: 'Chunk the sentence into three natural units: "Graduate researchers / may request extended overnight access / to the historical manuscript archive through the online portal."',
  },
  {
    externalCode: 'PTEA-DI-001',
    examCode: 'pte_academic',
    sectionCode: 'speaking',
    typeCode: 'describe_image',
    title: 'Global Renewable Capacity Growth (2016–2024)',
    difficulty: 'medium',
    topic: 'Energy & Economics',
    promptText: 'Look at the chart below. In 25 seconds, please speak into the microphone and describe in detail what the chart is showing. You will have 40 seconds to give your response.',
    stimulusJson: {
      visualType: 'renewable_bar_chart',
      visualTitle: 'Global Installed Renewable Energy Capacity (Gigawatts, 2016–2024)',
      visualSummary:
        'Grouped bar chart comparing Solar PV, Wind, and Hydroelectric capacity in 2016, 2020, and 2024. Solar surged from 305 GW (2016) to 760 GW (2020) and 1,620 GW (2024), surpassing both Wind (487 GW -> 745 GW -> 1,090 GW) and Hydro (1,130 GW -> 1,210 GW -> 1,285 GW).',
    },
    mediaJson: { visualKey: 'renewable_bar_chart' },
    answerKeyJson: {
      referenceText:
        'This grouped bar chart illustrates global installed renewable energy capacity in gigawatts across Solar PV, Wind, and Hydroelectric sources from 2016 to 2024. While hydroelectric power remained relatively stable growing modestly from 1,130 to 1,285 gigawatts, solar energy experienced the most dramatic expansion, rising more than fivefold from 305 gigawatts in 2016 to 1,620 gigawatts in 2024 and overtaking both hydro and wind. Wind capacity also more than doubled to 1,090 gigawatts, highlighting rapid global acceleration in solar and wind deployment.',
    },
    explanation: 'Open with the chart title and units, highlight the highest and lowest figures, contrast Solar’s rapid surge with Hydro’s steady baseline, and close with a 1-sentence conclusion.',
  },
  {
    externalCode: 'PTEA-RL-001',
    examCode: 'pte_academic',
    sectionCode: 'speaking',
    typeCode: 'retell_lecture',
    title: 'Acoustic Ecology in Coral Reef Restoration',
    difficulty: 'hard',
    topic: 'Marine Biology',
    promptText: 'You will hear a lecture. After listening to the lecture, in 10 seconds, please speak into the microphone and retell what you have just heard in your own words.',
    stimulusJson: {
      audioScript:
        'Marine ecologists have discovered that healthy coral reefs are surprisingly noisy environments, filled with the crackling of snapping shrimp and the low-frequency calls of reef fish. Juvenile fish drifting in the open ocean actually use these underwater soundscapes as acoustic beacons to locate thriving habitats. In degraded reefs that have fallen silent, researchers tested underwater loudspeakers playing recordings of healthy reefs. Within six weeks, larval fish settlement doubled compared to silent control sites, showing that acoustic enrichment can accelerate natural reef recovery alongside coral planting.',
      maxPlays: 1,
    },
    mediaJson: { ttsType: 'single', voiceName: 'Charon' },
    answerKeyJson: {
      referenceText:
        'The lecture explains how healthy coral reefs generate rich soundscapes from shrimp and fish that guide juvenile fish to suitable habitats. When researchers broadcast healthy reef recordings over degraded silent reefs using underwater speakers, larval fish settlement doubled in six weeks, suggesting acoustic enrichment supports reef restoration.',
    },
    explanation: 'Capture the core mechanism (reef sounds guide juvenile fish), the experimental intervention (underwater speakers), and the measured result (doubled settlement in six weeks).',
  },
  {
    externalCode: 'PTEA-ASQ-001',
    examCode: 'pte_academic',
    sectionCode: 'speaking',
    typeCode: 'answer_short_question',
    title: 'Instrument Measuring Atmospheric Pressure',
    difficulty: 'easy',
    topic: 'General Science',
    promptText: 'You will hear a question. Please give a simple and short answer. Often just one or a few words is enough.',
    stimulusJson: {
      audioScript: 'What scientific instrument do meteorologists use to measure atmospheric pressure?',
      maxPlays: 1,
    },
    mediaJson: { ttsType: 'single', voiceName: 'Kore' },
    answerKeyJson: { referenceText: 'Barometer' },
    explanation: 'A barometer measures atmospheric pressure; a thermometer measures temperature and an anemometer measures wind speed.',
  },
  {
    externalCode: 'PTEA-RTS-001',
    examCode: 'pte_academic',
    sectionCode: 'speaking',
    typeCode: 'respond_to_situation',
    title: 'Rescheduling a Group Capstone Presentation',
    difficulty: 'medium',
    topic: 'Academic Communication',
    promptText: 'Listen to the situation carefully. You have 20 seconds to prepare and 40 seconds to respond appropriately.',
    stimulusJson: {
      audioScript:
        'You are the coordinator for a four-person university capstone project scheduled to present tomorrow morning. One teammate has just contacted you with a sudden high fever and cannot attend. Leave a polite, concise voice message for your faculty supervisor explaining the situation and proposing a practical solution.',
      maxPlays: 1,
    },
    mediaJson: { ttsType: 'single', voiceName: 'Zephyr' },
    answerKeyJson: {
      referenceText:
        'Hello Professor, this is a quick update regarding our capstone group presentation tomorrow morning. Unfortunately, one of our teammates has come down with a sudden fever and cannot participate. To avoid disrupting the schedule, we can either cover their slides among the remaining three members tomorrow or move to Thursday afternoon if a slot is available. Please let us know which option you prefer.',
    },
    explanation: 'Maintain polite academic register, clearly state the problem, offer a proactive solution, and invite confirmation.',
  },
  {
    externalCode: 'PTEA-SGD-001',
    examCode: 'pte_academic',
    sectionCode: 'speaking',
    typeCode: 'summarize_group_discussion',
    title: 'Seminar Debate on Open-Book University Exams',
    difficulty: 'hard',
    topic: 'Higher Education',
    promptText: 'You will hear a group discussion between two students. Summarize the main points and perspectives raised in the discussion.',
    stimulusJson: {
      multiSpeaker: [
        {
          speaker: 'Maya',
          text: 'I genuinely think open-book exams reflect real professional problem solving much better than memorizing formulas overnight. When students can consult reference sheets, questions shift toward critical synthesis rather than rote recall.',
        },
        {
          speaker: 'Liam',
          text: 'That makes sense in theory, Maya, yet I noticed during our statistics midterm that students wasted precious time flipping through notes instead of analyzing the dataset. Without strong foundational fluency, open-book formats can actually widen the gap between prepared and unprepared students.',
        },
        {
          speaker: 'Maya',
          text: 'Fair point. Perhaps a hybrid approach works best—closed-book quizzes for core terminology early in the semester, followed by open-book case analyses for final assessments.',
        },
      ],
      maxPlays: 1,
    },
    mediaJson: { ttsType: 'multi' },
    answerKeyJson: {
      referenceText:
        'Maya argues that open-book exams promote critical synthesis and mirror real-world problem solving rather than rote memorization. Liam counters that searching through notes wastes exam time and disadvantages students who lack foundational mastery. Maya concedes this concern and proposes a hybrid model combining closed-book foundational quizzes with open-book analytical finals.',
    },
    explanation: 'Attribute each viewpoint accurately (Maya’s pro-synthesis stance, Liam’s time-management critique, and the concluding hybrid compromise).',
  },
  {
    externalCode: 'PTEA-SWT-001',
    examCode: 'pte_academic',
    sectionCode: 'writing',
    typeCode: 'summarize_written_text',
    title: 'Circular Architecture and Modular Timber',
    difficulty: 'medium',
    topic: 'Architecture & Sustainability',
    promptText: 'Read the passage below and summarize it using ONE complete sentence. Type your response in the box (5–75 words). You have 10 minutes.',
    stimulusJson: {
      passage:
        'Conventional reinforced concrete accounts for nearly eight percent of global carbon dioxide emissions, prompting structural engineers to revisit cross-laminated timber (CLT) for mid-rise commercial construction. Unlike traditional lumber, CLT panels are bonded in perpendicular layers that rival steel in strength-to-weight ratio while sequestering atmospheric carbon throughout a building’s lifespan. Equally transformative is the shift toward dry-jointed modular connectors rather than permanent adhesives, allowing entire structural bays to be disassembled and reused once a building reaches the end of its functional lease. Although updated municipal fire codes and moisture-monitoring sensors are still needed to scale adoption worldwide, early European and North American demonstration towers confirm that circular timber architecture can cut embodied construction emissions by more than half.',
      minWords: 5,
      maxWords: 75,
    },
    mediaJson: {},
    answerKeyJson: {
      modelAnswer:
        'Cross-laminated timber combined with reusable modular connectors offers a low-carbon alternative to concrete that can halve construction emissions, provided fire codes and moisture monitoring expand to support wider adoption.',
    },
    explanation: 'Ensure strict single-sentence form (one capital letter at the start, one full stop at the end, 35–55 words is optimal) capturing CLT benefits, modular reuse, and remaining adoption requirements.',
  },
  {
    externalCode: 'PTEA-WE-001',
    examCode: 'pte_academic',
    sectionCode: 'writing',
    typeCode: 'write_essay',
    title: 'Mandatory Public Transit Subsidies vs. Electric Vehicle Incentives',
    difficulty: 'medium',
    topic: 'Urban Policy',
    promptText:
      'Governments aiming to reduce urban transport emissions face a funding choice: subsidizing electric private vehicles or investing heavily in affordable public transit networks. Discuss both perspectives and give your own reasoned opinion. Write 200–300 words.',
    stimulusJson: { minWords: 200, maxWords: 300 },
    mediaJson: {},
    answerKeyJson: {
      modelAnswer:
        'Reducing urban carbon emissions requires strategic allocation of public transport budgets, sparking debate over whether governments should subsidize private electric vehicles (EVs) or prioritize mass public transit. While EV incentives accelerate fleet modernization, prioritizing public transit yields broader environmental and social returns.\n\nAdvocates of electric vehicle subsidies argue that consumer rebates lower upfront purchase barriers, encouraging rapid transitions away from combustion engines in sprawling suburbs where rail or bus coverage remains sparse. Furthermore, rising EV demand stimulates domestic battery innovation and charging infrastructure investment, creating green-collar employment.\n\nNevertheless, expanding affordable public transit addresses structural urban challenges that private EVs cannot solve. Electric cars still contribute to traffic congestion, particulate emissions from tire wear, and extensive parking land consumption. In contrast, electrified metro lines and bus rapid transit move hundreds of commuters per vehicle at a fraction of the per-passenger energy cost while guaranteeing mobility for lower-income residents who cannot afford even subsidized automobiles.\n\nIn conclusion, although targeted EV incentives play a complementary role in low-density outer districts, governments should direct the majority of climate funding toward reliable, accessible public transit systems that simultaneously cut emissions, ease congestion, and promote equitable urban mobility.',
    },
    explanation: 'Stay strictly inside the 200–300 word window for full Form points, use 4 clear paragraphs, and support each claim with concrete urban impact.',
  },
  {
    externalCode: 'PTEA-RWFB-001',
    examCode: 'pte_academic',
    sectionCode: 'reading',
    typeCode: 'rw_fill_blanks',
    title: 'Circadian Rhythms and Cognitive Alertness',
    difficulty: 'medium',
    topic: 'Neuroscience',
    promptText: 'Below is a text with blanks. Select the most appropriate word from each dropdown menu to complete the passage.',
    stimulusJson: {
      template:
        'Human alertness fluctuates predictably across a twenty-four-hour cycle governed by an internal biological clock. Exposure to short-wavelength blue light during early morning hours {{1}} the suppression of melatonin, signaling the brain to heighten wakefulness. Conversely, prolonged screen use late at night can {{2}} sleep onset by shifting this circadian phase backward. Sleep researchers therefore {{3}} dimming overhead lighting two hours before bedtime to preserve restorative deep sleep and daytime cognitive {{4}}.',
      options: {
        '1': ['triggers', 'prevents', 'hesitates', 'reverses'],
        '2': ['accelerate', 'delay', 'stabilize', 'simplify'],
        '3': ['refuse', 'recommend', 'ignore', 'compete'],
        '4': ['performance', 'furniture', 'migration', 'altitude'],
      },
    },
    mediaJson: {},
    answerKeyJson: {
      blanks: { '1': 'triggers', '2': 'delay', '3': 'recommend', '4': 'performance' },
    },
    explanation: 'Morning blue light triggers melatonin suppression; night screen light delays sleep onset; researchers recommend dimming lights for cognitive performance.',
  },
  {
    externalCode: 'PTEA-MCMR-001',
    examCode: 'pte_academic',
    sectionCode: 'reading',
    typeCode: 'mc_multiple_reading',
    title: 'Deep-Sea Hydrothermal Vents',
    difficulty: 'medium',
    topic: 'Oceanography',
    promptText: 'Read the text and select ALL statements that are supported by the passage. (Negative marking applies for incorrect choices.)',
    stimulusJson: {
      passage:
        'Before 1977, biologists assumed that all complex food webs ultimately depended on sunlight and photosynthesis. That assumption was overturned when deep-sea submersibles explored hydrothermal vents along the Galapagos Rift, over two kilometers beneath the ocean surface. Despite crushing pressure and complete darkness, dense communities of giant tube worms and blind shrimp thrived near superheated mineral plumes. Subsequent analysis revealed that specialized bacteria oxidize hydrogen sulfide expelled by the vents to synthesize organic nutrients—a process termed chemosynthesis—establishing an independent energy base that has since reshaped astrobiologists’ search for life on icy moons.',
      options: [
        { id: 'A', text: 'Sunlight was once considered indispensable for all complex ecosystems on Earth.' },
        { id: 'B', text: 'Hydrothermal vent bacteria convert hydrogen sulfide into organic nutrients without sunlight.' },
        { id: 'C', text: 'Giant tube worms near the Galapagos Rift rely on underwater algae for food.' },
        { id: 'D', text: 'The discovery of chemosynthesis influenced how scientists search for extraterrestrial life.' },
        { id: 'E', text: 'Hydrothermal vents occur exclusively at depths shallower than 500 meters.' },
      ],
    },
    mediaJson: {},
    answerKeyJson: { correctOptions: ['A', 'B', 'D'] },
    scoringConfigJson: { negativeMarking: true },
    explanation: 'Statements A, B, and D directly match the text. C contradicts chemosynthesis, and E contradicts "over two kilometers beneath the ocean surface".',
  },
  {
    externalCode: 'PTEA-ROP-001',
    examCode: 'pte_academic',
    sectionCode: 'reading',
    typeCode: 'reorder_paragraphs',
    title: 'Evolution of Maritime Chronometers',
    difficulty: 'hard',
    topic: 'History of Science',
    promptText: 'Arrange the text boxes below into the correct logical order. Each correct adjacent pair earns 1 point.',
    stimulusJson: {
      items: [
        { id: 'C', text: 'In response to these catastrophic losses, the British Parliament enacted the Longitude Act of 1714, offering a substantial monetary prize for a reliable method.' },
        { id: 'A', text: 'Throughout the seventeenth century, transoceanic navigators could determine latitude accurately from solar altitude, yet calculating longitude at sea remained perilously unreliable.' },
        { id: 'D', text: 'Rather than relying on complex astronomical tables, self-taught carpenter John Harrison spent decades perfecting a temperature-compensated marine chronometer.' },
        { id: 'B', text: 'Because even minor longitudinal errors caused vessels to misjudge coastlines by hundreds of miles, entire fleets were frequently wrecked on uncharted shoals.' },
      ],
    },
    mediaJson: {},
    answerKeyJson: { correctOrder: ['A', 'B', 'C', 'D'] },
    explanation: 'A introduces the 17th-century longitude problem -> B explains its consequence ("Because even minor longitudinal errors...") -> C follows with "In response to these catastrophic losses" -> D introduces Harrison’s solution.',
  },
  {
    externalCode: 'PTEA-RFB-001',
    examCode: 'pte_academic',
    sectionCode: 'reading',
    typeCode: 'reading_fill_blanks',
    title: 'Microplastic Filtration in Coastal Estuaries',
    difficulty: 'medium',
    topic: 'Ecology',
    promptText: 'Select the correct word from the vocabulary bank for each blank in the passage.',
    stimulusJson: {
      template:
        'Coastal salt marshes act as natural biogeochemical buffers that trap suspended {{1}} before river runoff reaches open fisheries. Field sampling demonstrates that dense cordgrass roots reduce water {{2}}, allowing synthetic microfibers to settle into marsh sediments. Protecting these wetlands therefore delivers dual {{3}}: safeguarding juvenile marine species while curbing coastal pollution.',
      options: {
        '1': ['particles', 'velocities', 'benefits', 'regulations', 'shadows'],
        '2': ['velocity', 'particles', 'benefits', 'tradition', 'altitude'],
        '3': ['benefits', 'velocity', 'particles', 'obstacles', 'delays'],
      },
    },
    mediaJson: {},
    answerKeyJson: { blanks: { '1': 'particles', '2': 'velocity', '3': 'benefits' } },
    explanation: '"Suspended particles", "reduce water velocity", and "dual benefits" are high-frequency academic collocations.',
  },
  {
    externalCode: 'PTEA-MCSR-001',
    examCode: 'pte_academic',
    sectionCode: 'reading',
    typeCode: 'mc_single_reading',
    title: 'Behavioral Nudges in Household Energy Billing',
    difficulty: 'easy',
    topic: 'Behavioral Economics',
    promptText: 'Read the passage and select the single best answer.',
    stimulusJson: {
      passage:
        'Utility providers testing conservation strategies discovered that financial rebates alone produced modest reductions in household electricity use. However, when monthly bills added a simple neighborhood comparison showing how a home’s consumption ranked against efficient nearby households of similar size, average electricity usage dropped by nearly three percent within one quarter and persisted across subsequent seasons.',
      question: 'What is the primary finding highlighted by the passage?',
      options: [
        { id: 'A', text: 'Financial rebates eliminated seasonal peaks in household electricity demand.' },
        { id: 'B', text: 'Peer consumption comparisons yielded sustained energy savings beyond rebates alone.' },
        { id: 'C', text: 'Households ignored utility bills unless smart thermostats were installed.' },
        { id: 'D', text: 'Neighborhood comparisons only worked during winter months.' },
      ],
    },
    mediaJson: {},
    answerKeyJson: { correctOption: 'B' },
    explanation: 'Option B accurately synthesizes the contrast between modest rebate effects and sustained ~3% savings from social comparison.',
  },
  {
    externalCode: 'PTEA-SST-001',
    examCode: 'pte_academic',
    sectionCode: 'listening',
    typeCode: 'summarize_spoken_text',
    title: 'Sleep Consolidation and Declarative Memory',
    difficulty: 'medium',
    topic: 'Cognitive Psychology',
    promptText: 'You will hear a short lecture. Write a summary for a fellow student who was not present (50–70 words). You have 10 minutes.',
    stimulusJson: {
      audioScript:
        'Cognitive neuroscientists have long studied why students who space their study sessions across several nights outperform those who cram before an exam. During slow-wave deep sleep, the hippocampus rapidly replays newly encoded neural firing patterns, transferring fragile short-term memories into stable long-term cortical networks. Simultaneously, sleep prunes weak synaptic noise so key conceptual relationships stand out more clearly the next morning. Depriving learners of even a single night of sleep after learning reduces recall accuracy by up to forty percent, proving that rest is an active phase of memory consolidation rather than passive downtime.',
      maxPlays: 1,
      minWords: 50,
      maxWords: 70,
    },
    mediaJson: { ttsType: 'single', voiceName: 'Charon' },
    answerKeyJson: {
      modelAnswer:
        'The lecture explains that spacing study across nights improves retention because deep sleep actively consolidates memory. During slow-wave sleep, the hippocampus replays new neural patterns and transfers them to stable cortical networks while pruning synaptic noise. Missing even one night of sleep cuts recall accuracy by up to forty percent, demonstrating that sleep is essential to learning rather than passive rest.',
    },
    explanation: 'Stay strictly within 50–70 words, include hippocampus replay, cortical transfer, and the 40% recall drop statistic.',
  },
  {
    externalCode: 'PTEA-MCML-001',
    examCode: 'pte_academic',
    sectionCode: 'listening',
    typeCode: 'mc_multiple_listening',
    title: 'Autonomous Agricultural Drones in Vineyards',
    difficulty: 'medium',
    topic: 'Agritech',
    promptText: 'Listen to the recording and select ALL statements that accurately reflect the speaker’s remarks. (Negative marking applies.)',
    stimulusJson: {
      audioScript:
        'Modern viticulture is adopting multispectral drones to detect early vine water stress days before leaves show visible wilting. Instead of irrigating entire slopes uniformly, growers target only the dry micro-zones flagged by infrared maps, cutting seasonal water consumption by roughly twenty-five percent. While initial drone licensing and sensor calibration require upfront training, cooperative sharing programs now allow smaller family vineyards to split equipment costs.',
      maxPlays: 1,
      options: [
        { id: 'A', text: 'Infrared drone imaging detects vine water stress before visible wilting occurs.' },
        { id: 'B', text: 'Targeted irrigation can reduce seasonal vineyard water use by around a quarter.' },
        { id: 'C', text: 'Drones have completely eliminated the need for any operator training.' },
        { id: 'D', text: 'Shared cooperative programs help smaller vineyards afford drone equipment.' },
      ],
    },
    mediaJson: { ttsType: 'single', voiceName: 'Kore' },
    answerKeyJson: { correctOptions: ['A', 'B', 'D'] },
    scoringConfigJson: { negativeMarking: true },
    explanation: 'A, B, and D are explicitly stated; C is contradicted because licensing and calibration require upfront training.',
  },
  {
    externalCode: 'PTEA-LFB-001',
    examCode: 'pte_academic',
    sectionCode: 'listening',
    typeCode: 'listening_fill_blanks',
    title: 'Museum Pigment Conservation',
    difficulty: 'medium',
    topic: 'Art Conservation',
    promptText: 'Listen to the recording and type the exact missing words in each blank.',
    stimulusJson: {
      audioScript:
        'Conservators examining Renaissance manuscripts now use non-invasive spectroscopy to identify fragile mineral pigments without removing microscopic paint samples. Because prolonged ultraviolet exposure accelerates fading, galleries regulate display humidity and rotate rare folios every twelve weeks.',
      template:
        'Conservators examining Renaissance {{1}} now use non-invasive spectroscopy to identify fragile mineral {{2}} without removing microscopic paint samples. Because prolonged ultraviolet exposure accelerates {{3}}, galleries regulate display {{4}} and rotate rare folios every twelve weeks.',
      maxPlays: 1,
    },
    mediaJson: { ttsType: 'single', voiceName: 'Kore' },
    answerKeyJson: {
      blanks: { '1': 'manuscripts', '2': 'pigments', '3': 'fading', '4': 'humidity' },
    },
    explanation: 'Watch plural endings ("manuscripts", "pigments") and exact spelling ("humidity").',
  },
  {
    externalCode: 'PTEA-HCS-001',
    examCode: 'pte_academic',
    sectionCode: 'listening',
    typeCode: 'highlight_correct_summary',
    title: 'Bioluminescent Street Lighting Trials',
    difficulty: 'medium',
    topic: 'Biotechnology',
    promptText: 'You will hear a recording. Select the paragraph that best relates to the recording.',
    stimulusJson: {
      audioScript:
        'Several coastal towns in Northern Europe have piloted street-marker panels powered by sealed marine bioluminescent bacteria rather than conventional LEDs. Although the soft cyan glow is not bright enough for highway illumination, urban designers found it ideal for pedestrian waterfront paths because it consumes zero grid electricity and avoids disrupting nocturnal migratory birds.',
      maxPlays: 1,
      question: 'Which summary best matches the audio?',
      options: [
        {
          id: 'A',
          text: 'Northern European towns replaced all highway streetlights with marine bacteria panels that shine brighter than LEDs.',
        },
        {
          id: 'B',
          text: 'Coastal pilot trials show bioluminescent bacterial panels provide zero-grid, wildlife-friendly soft lighting well suited to pedestrian paths rather than highways.',
        },
        {
          id: 'C',
          text: 'Bioluminescent lighting failed because nocturnal birds were attracted to the cyan glow along waterfronts.',
        },
      ],
    },
    mediaJson: { ttsType: 'single', voiceName: 'Zephyr' },
    answerKeyJson: { correctOption: 'B' },
    explanation: 'Option B accurately captures the scope (pedestrian paths, not highways), zero grid use, and reduced bird disruption.',
  },
  {
    externalCode: 'PTEA-MCSL-001',
    examCode: 'pte_academic',
    sectionCode: 'listening',
    typeCode: 'mc_single_listening',
    title: 'Ancient Roman Concrete Durability',
    difficulty: 'easy',
    topic: 'Materials Science',
    promptText: 'Listen to the recording and select the single correct answer.',
    stimulusJson: {
      audioScript:
        'Engineers long wondered why two-thousand-year-old Roman seawalls remain intact while modern concrete erodes within decades. Recent electron microscopy revealed tiny white lime clasts embedded in the mortar. When saltwater seeps into microscopic cracks, these reactive lime inclusions dissolve and recrystallize, automatically sealing fractures before structural corrosion begins.',
      maxPlays: 1,
      question: 'According to the speaker, what enables Roman marine concrete to resist cracking?',
      options: [
        { id: 'A', text: 'Steel reinforcing bars coated in volcanic ash' },
        { id: 'B', text: 'Reactive lime inclusions that dissolve and self-seal tiny cracks' },
        { id: 'C', text: 'Annual waterproof sealants applied by harbor authorities' },
        { id: 'D', text: 'Complete exclusion of seawater from harbor structures' },
      ],
    },
    mediaJson: { ttsType: 'single', voiceName: 'Charon' },
    answerKeyJson: { correctOption: 'B' },
    explanation: 'The lime clasts react with infiltrating water and recrystallize to seal micro-cracks.',
  },
  {
    externalCode: 'PTEA-SMW-001',
    examCode: 'pte_academic',
    sectionCode: 'listening',
    typeCode: 'select_missing_word',
    title: 'Arctic Permafrost Core Analysis',
    difficulty: 'medium',
    topic: 'Climate Science',
    promptText: 'Listen to the recording. The final phrase has been replaced by a beep. Select the best option to complete the recording.',
    stimulusJson: {
      audioScript:
        'Paleoclimatologists drill deep ice cores in Greenland because trapped air bubbles preserve direct samples of prehistoric atmospheres. By comparing ancient carbon dioxide ratios with modern atmospheric measurements, researchers can reconstruct long-term temperature shifts with remarkable [BEEP].',
      maxPlays: 1,
      question: 'Select the missing word replaced by the beep:',
      options: [
        { id: 'A', text: 'precision' },
        { id: 'B', text: 'hesitation' },
        { id: 'C', text: 'congestion' },
        { id: 'D', text: 'disruption' },
      ],
    },
    mediaJson: { ttsType: 'single', voiceName: 'Kore' },
    answerKeyJson: { correctOption: 'A' },
    explanation: '"Reconstruct long-term temperature shifts with remarkable precision" fits both semantic context and collocation.',
  },
  {
    externalCode: 'PTEA-HIW-001',
    examCode: 'pte_academic',
    sectionCode: 'listening',
    typeCode: 'highlight_incorrect_words',
    title: 'Pollinator Corridors Along Railways',
    difficulty: 'medium',
    topic: 'Conservation',
    promptText: 'Listen to the recording and click every word in the transcript below that differs from what the speaker says.',
    stimulusJson: {
      audioScript:
        'Regional rail authorities have transformed unused gravel embankments into blooming wildflower corridors that connect fragmented meadows. Biologists tracking native bumblebees recorded a substantial rebound in colony diversity within two summers.',
      displayTranscript:
        'Regional rail authorities have transformed unused concrete embankments into blooming wildflower corridors that connect isolated meadows. Biologists tracking native bumblebees recorded a modest rebound in colony diversity within two winters.',
      maxPlays: 1,
    },
    mediaJson: { ttsType: 'single', voiceName: 'Zephyr' },
    answerKeyJson: {
      // 0-indexed words in displayTranscript:
      // 0:Regional 1:rail 2:authorities 3:have 4:transformed 5:unused 6:concrete(gravel) 7:embankments 8:into 9:blooming 10:wildflower 11:corridors 12:that 13:connect 14:isolated(fragmented) 15:meadows. 16:Biologists 17:tracking 18:native 19:bumblebees 20:recorded 21:a 22:modest(substantial) 23:rebound 24:in 25:colony 26:diversity 27:within 28:two 29:winters.(summers.)
      incorrectWordIndices: [6, 14, 22, 29],
    },
    scoringConfigJson: { negativeMarking: true },
    explanation: 'Substituted words: concrete (spoken: gravel), isolated (fragmented), modest (substantial), winters (summers).',
  },
  {
    externalCode: 'PTEA-WFD-001',
    examCode: 'pte_academic',
    sectionCode: 'listening',
    typeCode: 'write_from_dictation',
    title: 'Statistical Significance in Clinical Trials',
    difficulty: 'medium',
    topic: 'Research Methods',
    promptText: 'You will hear a sentence. Type the sentence in the box below exactly as you hear it. Write as much of the sentence as you can.',
    stimulusJson: {
      audioScript: 'Peer reviewers verify whether clinical trial results demonstrate genuine statistical significance.',
      maxPlays: 1,
    },
    mediaJson: { ttsType: 'single', voiceName: 'Kore' },
    answerKeyJson: {
      referenceSentence: 'Peer reviewers verify whether clinical trial results demonstrate genuine statistical significance.',
    },
    explanation: 'Pay careful attention to plural nouns ("reviewers", "results") and spelling of "whether" and "significance".',
  },

  // ===================== PTE CORE =====================
  {
    externalCode: 'PTEC-RA-001',
    examCode: 'pte_core',
    sectionCode: 'speaking',
    typeCode: 'core_read_aloud',
    title: 'Community Recycling Depot Schedule Update',
    difficulty: 'easy',
    topic: 'Community Services',
    promptText: 'Read the community notice aloud naturally and clearly within 40 seconds.',
    stimulusJson: {
      passage:
        'Beginning next Monday, the Westside Recycling Depot will open thirty minutes earlier on weekdays to help commuters drop off sorted electronics and household batteries before work. Residents are reminded to place lithium batteries in clear safety bags available free of charge at the entrance.',
    },
    mediaJson: {},
    answerKeyJson: {
      referenceText:
        'Beginning next Monday, the Westside Recycling Depot will open thirty minutes earlier on weekdays to help commuters drop off sorted electronics and household batteries before work. Residents are reminded to place lithium batteries in clear safety bags available free of charge at the entrance.',
    },
    explanation: 'Deliver clear, everyday intonation with crisp phrasing around times and safety instructions.',
  },
  {
    externalCode: 'PTEC-RS-001',
    examCode: 'pte_core',
    sectionCode: 'speaking',
    typeCode: 'core_repeat_sentence',
    title: 'Warehouse Inventory Audit Notice',
    difficulty: 'medium',
    topic: 'Workplace',
    promptText: 'Listen once and repeat the workplace sentence accurately.',
    stimulusJson: {
      audioScript: 'All shift supervisors must submit their updated safety inspection checklists before Friday afternoon.',
      maxPlays: 1,
    },
    mediaJson: { ttsType: 'single', voiceName: 'Puck' },
    answerKeyJson: {
      referenceText: 'All shift supervisors must submit their updated safety inspection checklists before Friday afternoon.',
    },
    explanation: 'Keep pace steady and include plural markers ("supervisors", "checklists").',
  },
  {
    externalCode: 'PTEC-DI-001',
    examCode: 'pte_core',
    sectionCode: 'speaking',
    typeCode: 'core_describe_image',
    title: 'Quarterly Commuter Mode Share',
    difficulty: 'medium',
    topic: 'Transport & Workplace',
    promptText: 'Look at the chart and describe the main points clearly in 40 seconds.',
    stimulusJson: {
      visualType: 'renewable_bar_chart',
      visualTitle: 'Regional Clean Energy & Transit Adoption Trends (2016–2024)',
      visualSummary: 'Comparison chart showing dramatic growth in clean solar and wind energy capacity alongside stable hydro baselines.',
    },
    mediaJson: { visualKey: 'renewable_bar_chart' },
    answerKeyJson: {
      referenceText:
        'The chart compares three clean energy categories between 2016 and 2024. Solar shows the fastest growth reaching 1,620 gigawatts, wind more than doubles to 1,090, and hydro stays steady near 1,285.',
    },
    explanation: 'Summarize trends concisely in practical, natural spoken English.',
  },
  {
    externalCode: 'PTEC-RTS-001',
    examCode: 'pte_core',
    sectionCode: 'speaking',
    typeCode: 'core_respond_situation',
    title: 'Clarifying a Delayed Furniture Delivery',
    difficulty: 'medium',
    topic: 'Customer Service',
    promptText: 'Listen to the everyday situation and respond politely and clearly in 40 seconds.',
    stimulusJson: {
      audioScript:
        'You ordered an ergonomic office chair for your home workspace, and the delivery window passed two hours ago with no courier update. Call the store’s customer support desk, explain the issue calmly, and ask for a confirmed rescheduled time slot.',
      maxPlays: 1,
    },
    mediaJson: { ttsType: 'single', voiceName: 'Zephyr' },
    answerKeyJson: {
      referenceText:
        'Hi there, I am calling about an ergonomic office chair scheduled for delivery earlier today. The two-hour window has already passed and I have not received any tracking update. Could you please check with the courier and confirm a reliable delivery slot for tomorrow afternoon so I can make sure someone is home?',
    },
    explanation: 'Use courteous, practical tone, summarize the delay clearly, and state your exact request.',
  },
  {
    externalCode: 'PTEC-ASQ-001',
    examCode: 'pte_core',
    sectionCode: 'speaking',
    typeCode: 'core_answer_short',
    title: 'Document Authorizing International Travel',
    difficulty: 'easy',
    topic: 'Everyday Life',
    promptText: 'Listen to the question and give a concise answer.',
    stimulusJson: {
      audioScript: 'What official government booklet must travelers present at airport border control when entering a foreign country?',
      maxPlays: 1,
    },
    mediaJson: { ttsType: 'single', voiceName: 'Kore' },
    answerKeyJson: { referenceText: 'Passport' },
    explanation: 'A single accurate noun ("passport") receives full credit.',
  },
  {
    externalCode: 'PTEC-WE-001',
    examCode: 'pte_core',
    sectionCode: 'writing',
    typeCode: 'core_write_email',
    title: 'Requesting Flexible Remote Work Hours',
    difficulty: 'medium',
    topic: 'Workplace Communication',
    promptText:
      'You work at a regional logistics firm and would like to propose working remotely two days per week to reduce your commute and improve focus on quarterly reporting. Write a professional email (50–120 words) to your manager, Ms. Patel, explaining: (1) why you are requesting the arrangement, (2) how you will maintain team communication, and (3) a proposed 4-week trial review.',
    stimulusJson: { minWords: 50, maxWords: 120 },
    mediaJson: {},
    answerKeyJson: {
      modelAnswer:
        'Subject: Proposal for Two-Day Hybrid Work Trial\n\nDear Ms. Patel,\n\nI am writing to propose working remotely on Tuesdays and Thursdays starting next month. Eliminating my two-hour round-trip commute on those days will give me uninterrupted focus for completing our quarterly logistics forecasts ahead of schedule.\n\nTo ensure seamless collaboration, I will remain fully reachable on team chat during core business hours and join all morning stand-ups by video. I suggest piloting this arrangement for four weeks and reviewing my output metrics together afterward.\n\nPlease let me know when we can briefly discuss this.\n\nBest regards,\nAlex Rivera',
    },
    explanation: 'Include proper greeting, clear subject/purpose, all three required bullet points, professional sign-off, and stay inside 50–120 words.',
  },
  {
    externalCode: 'PTEC-SWT-001',
    examCode: 'pte_core',
    sectionCode: 'writing',
    typeCode: 'core_swt',
    title: 'Neighborhood Tool Lending Libraries',
    difficulty: 'easy',
    topic: 'Community Living',
    promptText: 'Read the article below and write a 25–50 word summary in your own words.',
    stimulusJson: {
      passage:
        'Tool lending libraries are growing rapidly in urban neighborhoods where apartment residents rarely have storage space for drills, ladders, or garden saws. For a modest annual membership fee, borrowers check out maintained equipment for up to a week, saving hundreds of dollars while reducing household manufacturing waste. Many branches also host weekend repair workshops led by retired tradespeople, strengthening local community connections.',
      minWords: 25,
      maxWords: 50,
    },
    mediaJson: {},
    answerKeyJson: {
      modelAnswer:
        'Urban tool lending libraries let residents borrow maintained equipment for a small annual fee, saving money, storage space, and manufacturing waste while fostering community ties through weekend repair workshops.',
    },
    explanation: 'PTE Core SWT accepts 1–2 clear sentences totaling 25–50 words.',
  },
  {
    externalCode: 'PTEC-RWFB-001',
    examCode: 'pte_core',
    sectionCode: 'reading',
    typeCode: 'core_rw_blanks',
    title: 'Small Business Digital Invoicing',
    difficulty: 'easy',
    topic: 'Business Operations',
    promptText: 'Select the best word from each dropdown to complete the workplace guide.',
    stimulusJson: {
      template:
        'Switching from paper receipts to automated digital invoicing helps independent contractors {{1}} payment delays. When clients receive itemized statements with clear due dates, bookkeeping errors {{2}} significantly and year-end tax preparation becomes far more {{3}}.',
      options: {
        '1': ['reduce', 'inflate', 'forget', 'borrow'],
        '2': ['decline', 'celebrate', 'explode', 'wander'],
        '3': ['efficient', 'fragile', 'distant', 'noisy'],
      },
    },
    mediaJson: {},
    answerKeyJson: { blanks: { '1': 'reduce', '2': 'decline', '3': 'efficient' } },
    explanation: 'All three blanks test standard business collocations: reduce delays, errors decline, more efficient preparation.',
  },
  {
    externalCode: 'PTEC-ROP-001',
    examCode: 'pte_core',
    sectionCode: 'reading',
    typeCode: 'core_reorder',
    title: 'Onboarding New Office Equipment',
    difficulty: 'easy',
    topic: 'Workplace Procedures',
    promptText: 'Reorder the steps of the office onboarding procedure logically.',
    stimulusJson: {
      items: [
        { id: 'B', text: 'Once approved, the IT coordinator configures security permissions and loads department software.' },
        { id: 'A', text: 'Department managers must first submit an equipment request form at least five business days before a new hire starts.' },
        { id: 'C', text: 'Finally, the laptop is handed over during orientation after the employee signs the asset receipt.' },
      ],
    },
    mediaJson: {},
    answerKeyJson: { correctOrder: ['A', 'B', 'C'] },
    explanation: 'Chronological transition cues ("must first", "Once approved", "Finally") define the A -> B -> C order.',
  },
  {
    externalCode: 'PTEC-WFD-001',
    examCode: 'pte_core',
    sectionCode: 'listening',
    typeCode: 'core_wfd',
    title: 'Transit Pass Renewal Reminder',
    difficulty: 'easy',
    topic: 'Everyday Services',
    promptText: 'Listen once and type the sentence accurately.',
    stimulusJson: {
      audioScript: 'Commuters should renew their monthly transit passes online before the final day of each month.',
      maxPlays: 1,
    },
    mediaJson: { ttsType: 'single', voiceName: 'Puck' },
    answerKeyJson: {
      referenceSentence: 'Commuters should renew their monthly transit passes online before the final day of each month.',
    },
    explanation: 'Watch spelling of "commuters", "their", and plural "passes".',
  },
  {
    externalCode: 'PTEC-HIW-001',
    examCode: 'pte_core',
    sectionCode: 'listening',
    typeCode: 'core_hiw',
    title: 'Local Farmers Market Relocation',
    difficulty: 'easy',
    topic: 'Community News',
    promptText: 'Click every word in the text that differs from the spoken announcement.',
    stimulusJson: {
      audioScript:
        'The Saturday farmers market will temporarily move to Riverside Park while paving crews upgrade the central plaza sidewalks.',
      displayTranscript:
        'The Sunday farmers market will permanently move to Riverside Park while paving crews upgrade the central station sidewalks.',
      maxPlays: 1,
    },
    mediaJson: { ttsType: 'single', voiceName: 'Kore' },
    answerKeyJson: { incorrectWordIndices: [1, 5, 16] },
    scoringConfigJson: { negativeMarking: true },
    explanation: 'Differences: Sunday (Saturday), permanently (temporarily), station (plaza).',
  },

  // ===================== IELTS ACADEMIC =====================
  {
    externalCode: 'IELTSA-SP1-001',
    examCode: 'ielts_academic',
    sectionCode: 'speaking',
    typeCode: 'ielts_sp_part1',
    title: 'Part 1: Reading Habits & Public Libraries',
    difficulty: 'easy',
    topic: 'Daily Life & Learning',
    promptText:
      'Answer these Part 1 examiner questions naturally (aim for 3–5 connected sentences): "Do you prefer reading printed books or digital articles? How often do you visit libraries or quiet study spaces, and why?"',
    stimulusJson: {
      audioScript:
        'Do you prefer reading printed books or digital articles? How often do you visit libraries or quiet study spaces, and why?',
      maxPlays: 2,
    },
    mediaJson: { ttsType: 'single', voiceName: 'Zephyr' },
    answerKeyJson: {
      referenceText:
        'Extend beyond one-word answers with specific reasons, natural discourse markers, and accurate tense control across familiar topics.',
    },
    explanation: 'For Band 7+, avoid short rehearsed replies; give a clear preference, a concrete example, and a subtle contrast.',
  },
  {
    externalCode: 'IELTSA-SP2-001',
    examCode: 'ielts_academic',
    sectionCode: 'speaking',
    typeCode: 'ielts_sp_part2',
    title: 'Part 2 Cue Card: A Practical Skill You Learned Recently',
    difficulty: 'medium',
    topic: 'Personal Achievement',
    promptText:
      'Describe a useful practical skill you learned within the past two years. You should say:\n• What the skill is and why you chose to learn it\n• How you practiced or who helped you\n• What difficulties you faced along the way\n• And explain how this skill has benefited your study or daily life.',
    stimulusJson: {
      cueBullets: [
        'What the skill is and why you chose to learn it',
        'How you practiced or who helped you',
        'What difficulties you faced along the way',
        'How this skill has benefited your study or daily life',
      ],
    },
    mediaJson: {},
    answerKeyJson: {
      referenceText:
        'Speak continuously for 90–120 seconds addressing all four prompts with clear narrative signposting, idiomatic precision, and varied complex clauses.',
    },
    explanation: 'Use your 60-second prep to note 3 keywords per bullet so you speak fluently for the full 2 minutes without stalling.',
  },
  {
    externalCode: 'IELTSA-SP3-001',
    examCode: 'ielts_academic',
    sectionCode: 'speaking',
    typeCode: 'ielts_sp_part3',
    title: 'Part 3: Automation and Future Skill Demand',
    difficulty: 'hard',
    topic: 'Society & Technology',
    promptText:
      'Examiner Discussion Question: "As artificial intelligence automates routine tasks, which human skills do you think universities should prioritize, and should governments subsidize mid-career retraining?"',
    stimulusJson: {
      audioScript:
        'As artificial intelligence automates routine tasks, which human skills do you think universities should prioritize, and should governments subsidize mid-career retraining?',
      maxPlays: 2,
    },
    mediaJson: { ttsType: 'single', voiceName: 'Charon' },
    answerKeyJson: {
      referenceText:
        'Deliver analytical, abstract reasoning weighing societal trade-offs, conditional structures, hedging language, and precise academic vocabulary.',
    },
    explanation: 'Band 7.5–8.5 Part 3 responses move beyond personal anecdotes to weigh institutional, economic, and ethical trade-offs.',
  },
  {
    externalCode: 'IELTSA-WR1-001',
    examCode: 'ielts_academic',
    sectionCode: 'writing',
    typeCode: 'ielts_wr_task1_academic',
    title: 'Academic Task 1: Coastal Seawater Desalination Process',
    difficulty: 'medium',
    topic: 'Engineering Processes',
    promptText:
      'The diagram below illustrates the five primary stages of a modern coastal seawater desalination plant. Summarize the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words.',
    stimulusJson: {
      visualType: 'desalination_diagram',
      visualTitle: 'Coastal Seawater Desalination Process (5 Stages)',
      visualSummary:
        'Five-stage linear process diagram: (1) Offshore Submerged Intake Screen -> (2) Sand & Micro-Filtration (removes suspended solids) -> (3) High-Pressure Reverse Osmosis Membrane (60 bar pressure separates freshwater from concentrated brine discharged offshore) -> (4) Remineralization & pH Balancing (adds calcium/magnesium & UV disinfection) -> (5) Municipal Storage Reservoir & Distribution Grid.',
      minWords: 150,
      maxWords: 240,
    },
    mediaJson: { visualKey: 'desalination_diagram' },
    answerKeyJson: {
      modelAnswer:
        'The diagram outlines the five sequential stages through which seawater is converted into potable municipal water inside a coastal desalination facility.\n\nOverall, the process transforms raw ocean water into safe drinking water through physical filtration, high-pressure membrane separation, and chemical balancing, while returning concentrated brine safely to the sea.\n\nIn the initial stage, seawater is drawn through a submerged offshore intake screen designed to exclude marine debris. The water then enters a pre-filtration chamber containing sand and micro-filters that strip away fine suspended sediments. Next, high-pressure pumps force the filtered water at approximately 60 bar across semi-permeable reverse osmosis membranes. This critical phase divides the stream into purified freshwater and dense saline brine, which is piped back offshore via a diffuser.\n\nIn the penultimate step, the desalinated water undergoes remineralization and ultraviolet disinfection to restore essential minerals such as calcium and stabilize pH levels. Finally, the treated water is stored in municipal reservoirs before entering the city distribution network.',
    },
    explanation: 'Include an explicit Overview paragraph summarizing start-to-end transformation and use passive voice + sequencing transitions cleanly.',
  },
  {
    externalCode: 'IELTSA-WR2-001',
    examCode: 'ielts_academic',
    sectionCode: 'writing',
    typeCode: 'ielts_wr_task2',
    title: 'Academic Task 2: Public Funding for Pure Scientific Research',
    difficulty: 'hard',
    topic: 'Science & Public Policy',
    promptText:
      'Some people argue that governments should only fund scientific research that produces immediate commercial or medical benefits, while others contend that curiosity-driven fundamental research is equally vital. Discuss both views and give your own opinion. Write at least 250 words.',
    stimulusJson: { minWords: 250, maxWords: 380 },
    mediaJson: {},
    answerKeyJson: {
      modelAnswer:
        'Allocating finite public research budgets poses a persistent dilemma: should states restrict funding to applied projects with immediate economic or clinical payoffs, or sustain curiosity-driven basic science whose utility may take decades to emerge? Although pressing societal challenges justify strong applied investment, neglecting fundamental inquiry would ultimately starve innovation at its source.\n\nProponents of outcome-focused funding emphasize fiscal accountability. Taxpayers understandably expect public expenditure to address urgent problems such as antimicrobial resistance, affordable clean energy, and food security. Directing grants toward translational laboratories with defined milestones accelerates deployment of vaccines and industrial technologies, generating measurable returns in public welfare and job creation.\n\nConversely, the history of science demonstrates that transformative breakthroughs frequently originate from open-ended theoretical inquiry. Quantum mechanics, initially pursued to explain subatomic spectra without any commercial blueprint, underpins every semiconductor, laser, and medical imaging scanner used today. Similarly, basic genetic studies of bacterial immune defenses unexpectedly yielded CRISPR gene-editing tools. Because private corporations rarely tolerate multi-decade commercial uncertainty, public institutions remain uniquely positioned to underwrite foundational research.\n\nIn my view, a resilient national science strategy requires a balanced portfolio rather than a binary choice. While applied initiatives deserve robust funding to tackle immediate crises, dedicating a protected share of public budgets to fundamental research safeguards the intellectual discoveries that tomorrow’s applied breakthroughs will inevitably depend upon.',
    },
    explanation: 'Develop both viewpoints with specific examples, state an unambiguous thesis, and maintain cohesive paragraph progression.',
  },
  {
    externalCode: 'IELTSA-TFNG-001',
    examCode: 'ielts_academic',
    sectionCode: 'reading',
    typeCode: 'ielts_rd_tfng',
    title: 'Mycorrhizal Networks in Old-Growth Forests',
    difficulty: 'medium',
    topic: 'Botany',
    promptText: 'Read the passage and decide whether the statement is TRUE, FALSE, or NOT GIVEN.',
    stimulusJson: {
      passage:
        'Beneath temperate forests, microscopic fungal threads called hyphae colonize tree roots to form mycorrhizal networks. Through these subterranean conduits, mature canopy trees exchange surplus photosynthetic carbon for phosphorus and nitrogen extracted by fungi from mineral soil. While field isotope-tracing experiments confirm that carbon molecules can move between neighboring trees of the same species, ecologists caution that whether such transfers consistently boost sapling survival rates across different climates remains actively debated.',
      question: 'Statement: Ecologists have conclusively proven that underground carbon transfer increases sapling survival in every climate zone.',
      options: [
        { id: 'TRUE', text: 'TRUE — agrees with the information in the passage' },
        { id: 'FALSE', text: 'FALSE — directly contradicts the passage' },
        { id: 'NOT GIVEN', text: 'NOT GIVEN — no information on this claim' },
      ],
    },
    mediaJson: {},
    answerKeyJson: { correctOption: 'FALSE' },
    explanation: 'The passage explicitly states that whether transfers boost sapling survival across different climates "remains actively debated", directly contradicting "conclusively proven".',
  },
  {
    externalCode: 'IELTSA-YNNG-001',
    examCode: 'ielts_academic',
    sectionCode: 'reading',
    typeCode: 'ielts_rd_ynng',
    title: 'Museum Digitalization and In-Person Attendance',
    difficulty: 'medium',
    topic: 'Cultural Heritage',
    promptText: 'Do the following statements agree with the views of the writer? Select YES, NO, or NOT GIVEN.',
    stimulusJson: {
      passage:
        'Early critics warned that publishing ultra-high-resolution artwork scans online would cannibalize museum ticket sales. Yet curators across London and Amsterdam report the opposite pattern: digital archives cultivate curiosity among international audiences who later travel specifically to witness the physical brushwork and scale in person. Far from replacing galleries, open digital collections act as an invitation to physical engagement.',
      question: 'Claim: The writer believes open online museum archives encourage more visitors to view physical artworks in person.',
      options: [
        { id: 'YES', text: 'YES — agrees with the writer’s view' },
        { id: 'NO', text: 'NO — contradicts the writer’s view' },
        { id: 'NOT GIVEN', text: 'NOT GIVEN — impossible to know what the writer thinks' },
      ],
    },
    mediaJson: {},
    answerKeyJson: { correctOption: 'YES' },
    explanation: 'The final sentence directly mirrors the claim: "open digital collections act as an invitation to physical engagement."',
  },
  {
    externalCode: 'IELTSA-RDMC-001',
    examCode: 'ielts_academic',
    sectionCode: 'reading',
    typeCode: 'ielts_rd_mc',
    title: 'Passive Cooling in Traditional Desert Architecture',
    difficulty: 'medium',
    topic: 'Architecture',
    promptText: 'Read the passage and select the correct letter (A–D).',
    stimulusJson: {
      passage:
        'Traditional courtyard houses in arid Middle Eastern cities employed windcatchers—tall masonry shafts oriented toward prevailing breezes—to channel cooler upper-level air downward across shaded water basins. Because thick adobe walls absorb daytime solar heat slowly and release it after sunset, interior rooms stay comfortable without mechanical air conditioning.',
      question: 'Why do adobe walls help keep traditional courtyard houses cool during the afternoon?',
      options: [
        { id: 'A', text: 'They reflect 100% of sunlight using metallic glazing.' },
        { id: 'B', text: 'They absorb daytime heat slowly and radiate it out after nightfall.' },
        { id: 'C', text: 'They pump chilled groundwater through interior pipes.' },
        { id: 'D', text: 'They block prevailing winds from entering the upper roof shaft.' },
      ],
    },
    mediaJson: {},
    answerKeyJson: { correctOption: 'B' },
    explanation: 'Thermal mass slows daytime heat transfer and releases stored warmth after sunset.',
  },
  {
    externalCode: 'IELTSA-MH-001',
    examCode: 'ielts_academic',
    sectionCode: 'reading',
    typeCode: 'ielts_rd_match_headings',
    title: 'Matching Headings: High-Speed Rail Economics',
    difficulty: 'hard',
    topic: 'Transport Economics',
    promptText: 'Match Paragraph A, Paragraph B, and Paragraph C to the most accurate heading from the list.',
    stimulusJson: {
      passage:
        'Paragraph A: High-speed rail projects demand immense upfront civil engineering outlays for viaducts, grade-separated tracks, and tunneling. Even densely populated corridors rarely recoup full capital construction costs from passenger ticket fares alone.\n\nParagraph B: Nevertheless, economists evaluating regional productivity observe substantial indirect gains: shorter intercity travel expands labor pools, clusters specialized suppliers, and shifts short-haul aviation passengers onto lower-emission electric trains.\n\nParagraph C: Policy analysts therefore stress that station placement determines commercial success; terminals integrated seamlessly into metro networks consistently outperform isolated peripheral hubs.',
      pairs: [
        { key: 'Paragraph A', prompt: 'Select heading for Paragraph A' },
        { key: 'Paragraph B', prompt: 'Select heading for Paragraph B' },
        { key: 'Paragraph C', prompt: 'Select heading for Paragraph C' },
      ],
      choices: [
        'i. Indirect economic and environmental spillovers',
        'ii. High capital costs relative to farebox revenue',
        'iii. Importance of downtown transit integration',
        'iv. Decline of freight locomotives worldwide',
      ],
    },
    mediaJson: {},
    answerKeyJson: {
      blanks: {
        'Paragraph A': 'ii. High capital costs relative to farebox revenue',
        'Paragraph B': 'i. Indirect economic and environmental spillovers',
        'Paragraph C': 'iii. Importance of downtown transit integration',
      },
    },
    explanation: 'Paragraph A focuses on upfront capital outlays vs fares; B highlights broader productivity/emission benefits; C stresses station location/metro integration.',
  },
  {
    externalCode: 'IELTSA-SC-001',
    examCode: 'ielts_academic',
    sectionCode: 'reading',
    typeCode: 'ielts_rd_summary_comp',
    title: 'Summary Completion: Iceberg Freshwater Nutrients',
    difficulty: 'medium',
    topic: 'Earth Science',
    promptText: 'Complete the summary using NO MORE THAN ONE WORD from the passage for each blank.',
    stimulusJson: {
      passage:
        'As massive Antarctic icebergs drift northward and melt, they release iron-rich glacial dust scraped from continental bedrock. This dissolved iron fertilizes microscopic phytoplankton blooms across surrounding surface waters, absorbing atmospheric carbon and feeding krill swarms that anchor Southern Ocean food chains.',
      template:
        'Melting Antarctic icebergs discharge iron-rich {{1}} gathered from bedrock. The iron triggers dense {{2}} blooms that draw down carbon and sustain {{3}} populations.',
    },
    mediaJson: {},
    answerKeyJson: {
      blanks: { '1': 'dust', '2': 'phytoplankton', '3': 'krill' },
    },
    explanation: 'Each answer is a single exact word lifted directly from the passage without exceeding the 1-word limit.',
  },
  {
    externalCode: 'IELTSA-DL-001',
    examCode: 'ielts_academic',
    sectionCode: 'reading',
    typeCode: 'ielts_rd_diagram_label',
    title: 'Diagram Label Completion: Desalination Stages',
    difficulty: 'medium',
    topic: 'Engineering',
    promptText: 'Read the technical note and label the missing stages (NO MORE THAN TWO WORDS per blank).',
    stimulusJson: {
      visualType: 'desalination_diagram',
      visualTitle: 'Desalination Facility Schematic',
      passage:
        'Raw ocean water enters through an offshore intake screen before passing through sand filters to remove suspended solids. High-pressure pumps then drive water across reverse osmosis membranes, producing freshwater alongside concentrated brine returned offshore. Finally, remineralization restores calcium before water enters municipal storage.',
      template: 'Stage 1: Offshore {{1}} screen | Stage 3: High-pressure {{2}} membrane | Stage 3 byproduct discharged offshore: {{3}}',
    },
    mediaJson: { visualKey: 'desalination_diagram' },
    answerKeyJson: {
      blanks: {
        '1': ['intake', 'intake screen'],
        '2': ['reverse osmosis', 'osmosis'],
        '3': ['brine', 'concentrated brine'],
      },
    },
    explanation: 'Cross-referencing the diagram stages with exact terminology from the passage yields intake, reverse osmosis, and brine.',
  },
  {
    externalCode: 'IELTSA-LSF-001',
    examCode: 'ielts_academic',
    sectionCode: 'listening',
    typeCode: 'ielts_ls_form_comp',
    title: 'Listening Section 1: University Field Trip Registration',
    difficulty: 'easy',
    topic: 'Campus Administration',
    promptText: 'Listen to the conversation and complete the registration form (ONE WORD AND/OR A NUMBER).',
    stimulusJson: {
      multiSpeaker: [
        {
          speaker: 'Coordinator',
          text: 'Good morning, Geography Department. Are you calling to register for the coastal ecology field trip?',
        },
        {
          speaker: 'Student',
          text: 'Yes, please! My surname is Lindholm—that is L-I-N-D-H-O-L-M. Could you confirm which coach stop we depart from?',
        },
        {
          speaker: 'Coordinator',
          text: 'We originally used the North Gate, oh wait—construction started there, so coaches leave from the Observatory car park at 7:45 a.m. Also, remember the lab equipment deposit is 35 pounds.',
        },
      ],
      template: 'Student Surname: {{1}} | Departure Location: {{2}} car park | Equipment Deposit: £{{3}}',
      maxPlays: 1,
    },
    mediaJson: { ttsType: 'multi' },
    answerKeyJson: {
      blanks: { '1': 'Lindholm', '2': 'Observatory', '3': '35' },
    },
    explanation: 'Classic IELTS distractor: "North Gate" is corrected immediately to "Observatory".',
  },
  {
    externalCode: 'IELTSA-LSMC-001',
    examCode: 'ielts_academic',
    sectionCode: 'listening',
    typeCode: 'ielts_ls_mc',
    title: 'Listening Section 3: Dissertation Methodology Tutorial',
    difficulty: 'medium',
    topic: 'Academic Research',
    promptText: 'Listen to the academic discussion and choose the correct letter (A, B, or C).',
    stimulusJson: {
      multiSpeaker: [
        {
          speaker: 'Tutor',
          text: 'Your draft literature review on bilingual primary classrooms is thorough, Hannah. Have you finalized your data collection method?',
        },
        {
          speaker: 'Hannah',
          text: 'Initially I planned to distribute online questionnaires to five hundred parents, though response rates are often skewed. After reading last week’s seminar paper, I decided to conduct structured classroom observations combined with follow-up teacher interviews instead.',
        },
      ],
      question: 'Which research approach has Hannah finally chosen for her dissertation?',
      options: [
        { id: 'A', text: 'Distributing online questionnaires to 500 parents' },
        { id: 'B', text: 'Structured classroom observations paired with teacher interviews' },
        { id: 'C', text: 'Analyzing historical census records from municipal archives' },
      ],
      maxPlays: 1,
    },
    mediaJson: { ttsType: 'multi' },
    answerKeyJson: { correctOption: 'B' },
    explanation: 'Option A is the rejected initial plan; Option B reflects her final decision.',
  },
  {
    externalCode: 'IELTSA-LSM-001',
    examCode: 'ielts_academic',
    sectionCode: 'listening',
    typeCode: 'ielts_ls_matching',
    title: 'Listening Section 2: Botanical Conservatory Map Zones',
    difficulty: 'medium',
    topic: 'Campus & Public Tours',
    promptText: 'Listen to the audio guide and match each conservatory wing to its main feature.',
    stimulusJson: {
      audioScript:
        'Welcome to the Botanical Conservatory. Straight ahead in the Glass Rotunda, we showcase rare tropical orchids requiring ninety percent humidity. To your west, the Arid Pavilion houses centuries-old desert cacti collected from Arizona and Namibia. Finally, the Alpine Terrace along the northern wall features miniature mountain conifers cooled by misting jets.',
      pairs: [
        { key: 'Glass Rotunda', prompt: 'Feature in Glass Rotunda' },
        { key: 'Arid Pavilion', prompt: 'Feature in Arid Pavilion' },
        { key: 'Alpine Terrace', prompt: 'Feature in Alpine Terrace' },
      ],
      choices: ['Tropical orchids', 'Desert cacti', 'Miniature mountain conifers', 'Freshwater lotus pond'],
      maxPlays: 1,
    },
    mediaJson: { ttsType: 'single', voiceName: 'Kore' },
    answerKeyJson: {
      blanks: {
        'Glass Rotunda': 'Tropical orchids',
        'Arid Pavilion': 'Desert cacti',
        'Alpine Terrace': 'Miniature mountain conifers',
      },
    },
    explanation: 'Match each spatial zone carefully while ignoring unused distractors.',
  },

  // ===================== IELTS GENERAL TRAINING =====================
  {
    externalCode: 'IELTSGT-SP1-001',
    examCode: 'ielts_general',
    sectionCode: 'speaking',
    typeCode: 'ielts_gt_sp_part1',
    title: 'Part 1: Neighborhood & Local Parks',
    difficulty: 'easy',
    topic: 'Community',
    promptText: 'Answer naturally: "What do you enjoy most about the neighborhood where you currently live, and is there anything you would like to improve?"',
    stimulusJson: {
      audioScript: 'What do you enjoy most about the neighborhood where you currently live, and is there anything you would like to improve?',
      maxPlays: 2,
    },
    mediaJson: { ttsType: 'single', voiceName: 'Zephyr' },
    answerKeyJson: { referenceText: 'Natural everyday fluency, clear pronunciation, and balanced descriptive detail.' },
    explanation: 'Give two concrete positives and one balanced suggestion using natural conversational connectors.',
  },
  {
    externalCode: 'IELTSGT-SP2-001',
    examCode: 'ielts_general',
    sectionCode: 'speaking',
    typeCode: 'ielts_gt_sp_part2',
    title: 'Part 2 Cue Card: A Helpful Neighbor or Colleague',
    difficulty: 'medium',
    topic: 'Everyday Relationships',
    promptText:
      'Describe a time when a neighbor or colleague helped you solve a difficult problem. Say:\n• Who the person was\n• What the problem involved\n• How they assisted you\n• And explain how you felt afterward.',
    stimulusJson: {
      cueBullets: ['Who the person was', 'What the problem involved', 'How they assisted you', 'How you felt afterward'],
    },
    mediaJson: {},
    answerKeyJson: { referenceText: 'Clear past-tense narrative spanning 90–120 seconds with rich personal detail.' },
    explanation: 'Maintain consistent past tenses and smooth narrative transitions.',
  },
  {
    externalCode: 'IELTSGT-WR1-001',
    examCode: 'ielts_general',
    sectionCode: 'writing',
    typeCode: 'ielts_wr_task1_letter',
    title: 'General Task 1: Semi-Formal Letter to Sports Center Manager',
    difficulty: 'medium',
    topic: 'Community Feedback',
    promptText:
      'You recently joined a local community swimming and fitness center, but you have noticed issues with locker room cleanliness and evening lane overcrowding. Write a letter (at least 150 words) to the center manager. In your letter:\n• Say how long you have been a member and what you appreciate about the facility\n• Describe the two problems you have experienced\n• Suggest practical improvements the management could implement.',
    stimulusJson: { minWords: 150, maxWords: 240 },
    mediaJson: {},
    answerKeyJson: {
      modelAnswer:
        'Dear Manager,\n\nI have been a regular member of the Oakridge Community Aquatic Center for the past four months, and I greatly appreciate the friendly reception staff and well-maintained lap pool.\n\nI am writing, however, to raise two concerns that have recently affected my evening visits. First, the men’s changing lockers often have damp floors and overflowing towel bins after 6:00 p.m., which creates an unpleasant and slippery environment. Second, because swim clubs and general public swimmers share the pool during peak weekday evenings, all six lanes become heavily congested, making continuous lap swimming difficult.\n\nTo address these issues, I would suggest scheduling an additional mid-evening cleaning check at 6:30 p.m. and clearly designating at least three lanes exclusively for slow, medium, and fast public lap swimmers during peak hours.\n\nThank you for your attention to this feedback, and I look forward to your response.\n\nYours faithfully,\nJordan Patel',
    },
    explanation: 'Use consistent semi-formal/formal register ("Dear Manager" -> "Yours faithfully") and cover every bullet point thoroughly.',
  },
  {
    externalCode: 'IELTSGT-WR2-001',
    examCode: 'ielts_general',
    sectionCode: 'writing',
    typeCode: 'ielts_gt_wr_task2',
    title: 'General Task 2: Four-Day Workweeks in Modern Companies',
    difficulty: 'medium',
    topic: 'Work-Life Balance',
    promptText:
      'More employers are experimenting with a four-day workweek without reducing employee salaries. Do the advantages of this trend outweigh the disadvantages? Write at least 250 words.',
    stimulusJson: { minWords: 250, maxWords: 380 },
    mediaJson: {},
    answerKeyJson: {
      modelAnswer:
        'A growing number of organizations are piloting four-day workweeks while maintaining full-time pay. Although shortened schedules introduce coordination challenges for customer-facing industries, I believe the long-term gains in employee wellbeing and productivity clearly outweigh the drawbacks.',
    },
    explanation: 'Establish a clear stance on whether advantages outweigh disadvantages and justify both sides systematically.',
  },
  {
    externalCode: 'IELTSGT-TFNG-001',
    examCode: 'ielts_general',
    sectionCode: 'reading',
    typeCode: 'ielts_gt_rd_tfng',
    title: 'Workplace Annual Leave Policy',
    difficulty: 'easy',
    topic: 'Employee Handbook',
    promptText: 'Read the handbook excerpt and decide if the statement is TRUE, FALSE, or NOT GIVEN.',
    stimulusJson: {
      passage:
        'Full-time staff accrue 22 paid vacation days per calendar year. Up to five unused days may automatically carry over into the following year provided they are used before March 31. Requests exceeding five consecutive business days must be submitted to your line manager at least three weeks in advance.',
      question: 'Statement: Employees may carry over up to ten unused vacation days into the next calendar year.',
      options: [
        { id: 'TRUE', text: 'TRUE' },
        { id: 'FALSE', text: 'FALSE' },
        { id: 'NOT GIVEN', text: 'NOT GIVEN' },
      ],
    },
    mediaJson: {},
    answerKeyJson: { correctOption: 'FALSE' },
    explanation: 'The policy explicitly caps automatic carryover at five unused days, not ten.',
  },
  {
    externalCode: 'IELTSGT-SC-001',
    examCode: 'ielts_general',
    sectionCode: 'reading',
    typeCode: 'ielts_gt_rd_summary',
    title: 'Municipal Bike-Share Membership Guide',
    difficulty: 'easy',
    topic: 'Everyday Services',
    promptText: 'Complete the notes using ONE WORD OR A NUMBER from the brochure.',
    stimulusJson: {
      passage:
        'CityCycle annual pass holders enjoy unlimited 45-minute rides across 140 docking stations. Trips exceeding 45 minutes incur a modest overtime fee of $2 per half hour. Electric-assist bicycles can be unlocked via the mobile app for an extra $1 per ride.',
      template: 'Included ride length: {{1}} minutes | Total docking stations: {{2}} | Extra e-bike unlock fee: ${{3}}',
    },
    mediaJson: {},
    answerKeyJson: { blanks: { '1': '45', '2': '140', '3': '1' } },
    explanation: 'Check numeric details accurately without repeating currency symbols already printed.',
  },
  {
    externalCode: 'IELTSGT-LS-001',
    examCode: 'ielts_general',
    sectionCode: 'listening',
    typeCode: 'ielts_gt_ls_form',
    title: 'Booking a Community Workshop Room',
    difficulty: 'easy',
    topic: 'Community Events',
    promptText: 'Listen and fill in the booking record (ONE WORD AND/OR A NUMBER).',
    stimulusJson: {
      audioScript:
        'Thank you for calling Cedar Hall Bookings. We have reserved the Maple Room for your photography club on Saturday, October 18. The room holds 28 people comfortably, and the refundable key deposit is 40 dollars.',
      template: 'Reserved Room: {{1}} Room | Capacity: {{2}} people | Refundable Deposit: ${{3}}',
      maxPlays: 1,
    },
    mediaJson: { ttsType: 'single', voiceName: 'Puck' },
    answerKeyJson: { blanks: { '1': 'Maple', '2': '28', '3': '40' } },
    explanation: 'Maple, 28, and 40 are stated sequentially in the confirmation call.',
  },

  // ===================== DUOLINGO ENGLISH TEST (DET) =====================
  {
    externalCode: 'DET-RS-001',
    examCode: 'det',
    sectionCode: 'adaptive',
    typeCode: 'det_read_select',
    title: 'Academic Vocabulary Discrimination Set 1',
    difficulty: 'medium',
    topic: 'Lexical Recognition',
    promptText: 'Select ALL real English words below. Leave plausible pseudo-words unselected.',
    stimulusJson: {
      words: [
        'resilient',
        'brantical',
        'empirical',
        'flormish',
        'coherent',
        'trivulate',
        'plausible',
        'screndon',
        'alleviate',
        'morbulate',
        'pragmatic',
        'venstry',
      ],
    },
    mediaJson: {},
    answerKeyJson: {
      allWords: [
        'resilient',
        'brantical',
        'empirical',
        'flormish',
        'coherent',
        'trivulate',
        'plausible',
        'screndon',
        'alleviate',
        'morbulate',
        'pragmatic',
        'venstry',
      ],
      realWords: ['resilient', 'empirical', 'coherent', 'plausible', 'alleviate', 'pragmatic'],
    },
    explanation: 'Real words: resilient, empirical, coherent, plausible, alleviate, pragmatic. The remaining six follow English phonotactics but are invented pseudo-words.',
  },
  {
    externalCode: 'DET-FB-001',
    examCode: 'det',
    sectionCode: 'adaptive',
    typeCode: 'det_fill_blanks',
    title: 'Single-Sentence Contextual Vocabulary',
    difficulty: 'medium',
    topic: 'Academic English',
    promptText: 'Complete the missing vocabulary word in each sentence (type the full word).',
    stimulusJson: {
      template:
        '1. Before publishing the survey, the team removed duplicate responses to ensure data {{1}} (hint: acc_____). 2. Solar panels convert sunlight directly into electrical {{2}} (hint: cur____).',
    },
    mediaJson: {},
    answerKeyJson: { blanks: { '1': 'accuracy', '2': 'current' } },
    explanation: '"Data accuracy" and "electrical current" match both the hints and syntactic slots.',
  },
  {
    externalCode: 'DET-RC-001',
    examCode: 'det',
    sectionCode: 'adaptive',
    typeCode: 'det_read_complete',
    title: 'C-Test: Urban Rooftop Gardens',
    difficulty: 'medium',
    topic: 'Urban Ecology',
    promptText: 'Type the missing letters to complete each partially revealed word in the paragraph.',
    stimulusJson: {
      segments: [
        { type: 'text', value: 'Rooftop gardens are becoming increasingly pop' },
        { type: 'blank', id: '1', prefix: 'pop', length: 4 },
        { type: 'text', value: ' in densely populated cities. By absorbing rain' },
        { type: 'blank', id: '2', prefix: 'rain', length: 5 },
        { type: 'text', value: ', planted roofs reduce storm' },
        { type: 'blank', id: '3', prefix: 'storm', length: 5 },
        { type: 'text', value: ' runoff and lower building cool' },
        { type: 'blank', id: '4', prefix: 'cool', length: 3 },
        { type: 'text', value: ' expenses during warm summer months.' },
      ],
    },
    mediaJson: {},
    answerKeyJson: {
      blanks: { '1': 'ular', '2': 'water', '3': 'water', '4': 'ing' },
    },
    explanation: 'Full restored words: popular, rainwater, stormwater, cooling.',
  },
  {
    externalCode: 'DET-RA-001',
    examCode: 'det',
    sectionCode: 'speaking',
    typeCode: 'det_read_aloud',
    title: 'Read Aloud: Renewable Microgrids',
    difficulty: 'easy',
    topic: 'Technology',
    promptText: 'Record yourself saying the statement below clearly within 20 seconds.',
    stimulusJson: {
      passage: 'Local battery microgrids allow rural clinics to maintain uninterrupted power during severe winter storms.',
    },
    mediaJson: {},
    answerKeyJson: {
      referenceText: 'Local battery microgrids allow rural clinics to maintain uninterrupted power during severe winter storms.',
    },
    explanation: 'Articulate "microgrids" and "uninterrupted" clearly at a natural pace.',
  },
  {
    externalCode: 'DET-LT-001',
    examCode: 'det',
    sectionCode: 'adaptive',
    typeCode: 'det_listen_type',
    title: 'Listen and Type: Museum Architecture',
    difficulty: 'medium',
    topic: 'Arts & Culture',
    promptText: 'Listen to the statement (up to 3 replays allowed) and type exactly what you hear.',
    stimulusJson: {
      audioScript: 'Natural skylights illuminate the main exhibition hall without damaging delicate historical textiles.',
      maxPlays: 3,
    },
    mediaJson: { ttsType: 'single', voiceName: 'Kore' },
    answerKeyJson: {
      referenceSentence: 'Natural skylights illuminate the main exhibition hall without damaging delicate historical textiles.',
    },
    explanation: 'Check double letters in "illuminate" and plural "skylights" / "textiles".',
  },
  {
    externalCode: 'DET-IR-001',
    examCode: 'det',
    sectionCode: 'adaptive',
    typeCode: 'det_interactive_reading',
    title: 'Interactive Reading: Deep-Ocean Bioluminescence',
    difficulty: 'medium',
    topic: 'Marine Science',
    promptText: 'Select the best option for each gap in the interactive academic passage.',
    stimulusJson: {
      template:
        'Below two hundred meters, sunlight fades rapidly into the twilight zone, where over seventy percent of marine organisms {{1}} their own light through bioluminescence. Some species flash bright pulses to {{2}} predators, whereas anglerfish dangle glowing lures to attract unsuspecting {{3}}.',
      options: {
        '1': ['generate', 'forget', 'borrow', 'cancel'],
        '2': ['startle', 'applaud', 'translate', 'repair'],
        '3': ['prey', 'anchor', 'timber', 'cargo'],
      },
    },
    mediaJson: {},
    answerKeyJson: { blanks: { '1': 'generate', '2': 'startle', '3': 'prey' } },
    explanation: 'Organisms generate light, flash to startle predators, and lure prey.',
  },
  {
    externalCode: 'DET-IL-001',
    examCode: 'det',
    sectionCode: 'adaptive',
    typeCode: 'det_interactive_listening',
    title: 'Interactive Listening: Campus Research Assistantship',
    difficulty: 'medium',
    topic: 'University Campus',
    promptText: 'Listen to the dialogue between a professor and a student, then write a concise 40–75 word summary of the conversation.',
    stimulusJson: {
      multiSpeaker: [
        {
          speaker: 'Professor',
          text: 'Thanks for stopping by, Elena. I reviewed your application for the summer acoustic lab assistantship and loved your Python data visualization portfolio.',
        },
        {
          speaker: 'Elena',
          text: 'Thank you so much! I wanted to confirm whether the ten weekly hours can be scheduled around my Tuesday morning chemistry lab.',
        },
        {
          speaker: 'Professor',
          text: 'Absolutely. Most data logging is flexible as long as you attend our Thursday afternoon lab meeting. I will send the onboarding contract to your university email this afternoon.',
        },
      ],
      maxPlays: 1,
      minWords: 35,
      maxWords: 80,
    },
    mediaJson: { ttsType: 'multi' },
    answerKeyJson: {
      modelAnswer:
        'A professor praised Elena’s Python visualization portfolio for a summer acoustic lab assistantship. Elena asked if the ten weekly hours could accommodate her Tuesday chemistry lab, and the professor confirmed flexible scheduling aside from Thursday afternoon lab meetings before promising to email the onboarding contract.',
    },
    explanation: 'Capture both participants’ goals, the schedule confirmation, and the next step.',
  },
  {
    externalCode: 'DET-WP-001',
    examCode: 'det',
    sectionCode: 'writing',
    typeCode: 'det_write_photo',
    title: 'Write About the Photo: Sunlit European Book & Flower Market',
    difficulty: 'medium',
    topic: 'Everyday Scenes',
    promptText: 'Write one or more detailed sentences describing the scene below. You have 1 minute.',
    stimulusJson: {
      visualType: 'market_scene',
      visualTitle: 'Outdoor Weekend Book and Flower Market',
      visualSummary:
        'Sunlit cobblestone plaza lined with wooden canvas-covered stalls displaying stacked hardcover books and colorful flower bouquets, with shoppers browsing beneath historic townhouses and leafy trees.',
      minWords: 25,
      maxWords: 90,
    },
    mediaJson: { visualKey: 'market_scene' },
    answerKeyJson: {
      modelAnswer:
        'In this lively outdoor plaza, shoppers stroll along a sunlit cobblestone street browsing wooden stalls filled with stacked secondhand books and fresh bouquets of flowers beneath striped canvas awnings and historic town buildings.',
    },
    explanation: 'Describe foreground activity, background setting, and sensory details using varied prepositional phrases.',
  },
  {
    externalCode: 'DET-IW-001',
    examCode: 'det',
    sectionCode: 'writing',
    typeCode: 'det_interactive_writing',
    title: 'Interactive Writing: Digital Detox Retreats',
    difficulty: 'medium',
    topic: 'Modern Lifestyle',
    promptText:
      'Step 1 (5 min): Many young professionals now schedule phone-free weekends to reduce digital fatigue. Why do you think constant connectivity feels exhausting, and what practical habits help people maintain healthy boundaries? (Aim for 100–180 words.)',
    stimulusJson: { minWords: 90, maxWords: 200 },
    mediaJson: {},
    answerKeyJson: {
      modelAnswer:
        'Constant notifications fragment attention and blur the boundary between professional obligations and personal rest, leaving many workers mentally fatigued even on weekends. Establishing practical routines—such as silencing non-urgent alerts after 8 p.m., keeping phones outside bedrooms, and dedicating Sunday mornings to outdoor activities—restores deep concentration and lowers everyday stress.',
    },
    explanation: 'Address both parts of the prompt clearly with concrete habits and cohesive reasoning.',
  },
  {
    externalCode: 'DET-SP-001',
    examCode: 'det',
    sectionCode: 'speaking',
    typeCode: 'det_speak_photo',
    title: 'Speak About the Photo: University Environmental Science Lab',
    difficulty: 'medium',
    topic: 'Science & Education',
    promptText: 'Prepare for 20 seconds, then speak for 30–90 seconds describing the laboratory scene in detail.',
    stimulusJson: {
      visualType: 'science_lab_scene',
      visualTitle: 'Graduate Environmental Research Laboratory',
      visualSummary:
        'Two university researchers in lab coats collaborating at a clean sunlit workbench, examining labeled water-quality flasks, a microscope, and real-time pH trend charts on a digital tablet.',
    },
    mediaJson: { visualKey: 'science_lab_scene' },
    answerKeyJson: {
      referenceText:
        'This scene depicts two university researchers collaborating inside a bright environmental science laboratory. One scientist examines labeled water samples beside a microscope while her colleague compares pH readings on a digital tablet, illustrating careful teamwork in modern empirical research.',
    },
    explanation: 'Move smoothly from general overview -> specific people/actions -> logical inference about their goal.',
  },
  {
    externalCode: 'DET-RTS-001',
    examCode: 'det',
    sectionCode: 'speaking',
    typeCode: 'det_read_then_speak',
    title: 'Read, Then Speak: Designing a Resilient Public Library',
    difficulty: 'medium',
    topic: 'Community Design',
    promptText:
      'Speak for 30–90 seconds on the topic below:\nDescribe how modern public libraries should evolve to serve both students and older residents. Explain:\n• Which physical spaces or digital tools are most valuable\n• How libraries strengthen neighborhood communities\n• One change you would make to a library you have visited.',
    stimulusJson: {},
    mediaJson: {},
    answerKeyJson: {
      referenceText:
        'Modern libraries thrive when they combine quiet reading rooms with maker spaces, free digital literacy workshops for seniors, and collaborative study booths for students.',
    },
    explanation: 'Cover all three prompts naturally without rushing or repeating phrases.',
  },
  {
    externalCode: 'DET-SS-001',
    examCode: 'det',
    sectionCode: 'speaking',
    typeCode: 'det_speaking_sample',
    title: 'Speaking Sample: Preserving Endangered Languages',
    difficulty: 'hard',
    topic: 'Linguistics & Culture',
    promptText:
      'Speak for 1–3 minutes on the following prompt: "Globalization connects billions through a handful of major languages, yet hundreds of indigenous languages face extinction. What is lost when a language disappears, and how can digital technology help preserve linguistic diversity?"',
    stimulusJson: {},
    mediaJson: {},
    answerKeyJson: {
      referenceText:
        'Losing a language erases ecological knowledge, oral history, and unique cultural perspectives. Digital audio archives, bilingual apps, and community podcasts help younger generations keep endangered tongues alive.',
    },
    explanation: 'Organize your extended response into an opening thesis, two concrete supporting points, and a concise wrap-up.',
  },
  {
    externalCode: 'DET-WS-001',
    examCode: 'det',
    sectionCode: 'writing',
    typeCode: 'det_writing_sample',
    title: 'Writing Sample: Balancing Historic Preservation and Affordable Housing',
    difficulty: 'hard',
    topic: 'Urban Planning',
    promptText:
      'Write for 3–5 minutes (120–220 words): "Growing cities often struggle to preserve historic architecture while building enough affordable housing for newcomers. How should city planners balance heritage conservation with modern housing demand?"',
    stimulusJson: { minWords: 120, maxWords: 240 },
    mediaJson: {},
    answerKeyJson: {
      modelAnswer:
        'Rapidly growing cities face a delicate tension between safeguarding architectural heritage and expanding affordable housing. While historic districts anchor civic identity and attract cultural tourism, freezing entire neighborhoods in amber drives up rents and pushes essential workers to distant suburbs. The most pragmatic solution lies in adaptive reuse and gentle density: converting obsolete commercial warehouses into residential apartments while allowing well-proportioned mid-rise infill buildings near transit corridors that echo traditional streetscapes without mimicking them artificially.',
    },
    explanation: 'Demonstrate mature vocabulary, clear thesis progression, and balanced real-world examples.',
  },
];

const SEED_PLANS = [
  {
    code: 'free',
    name: 'Free Explorer',
    targetAudience: 'For self-starters exploring exam formats',
    monthlyPriceUsd: 0,
    quarterlyPriceUsd: 0,
    annualPriceUsd: 0,
    featuresJson: [
      '15 practice questions per day across all 5 exams',
      '3 AI speaking & writing evaluations per day',
      '1 full-length diagnostic mock test per month',
      'Basic score history & mistake review',
    ],
    limitsJson: { dailyPractice: 15, dailyAiScoring: 3, fullMocksPerMonth: 1, seats: 1 },
  },
  {
    code: 'basic',
    name: 'Basic Prep',
    targetAudience: 'For steady daily skill building',
    monthlyPriceUsd: 19,
    quarterlyPriceUsd: 49,
    annualPriceUsd: 169,
    featuresJson: [
      '100 practice questions per day across all 5 exams',
      '15 AI speaking & writing evaluations per day',
      'Sectional mock tests & 4 full mocks per month',
      'Automated weakness analytics & CSV export',
    ],
    limitsJson: { dailyPractice: 100, dailyAiScoring: 15, fullMocksPerMonth: 4, seats: 1 },
  },
  {
    code: 'premium',
    name: 'Premium Achiever',
    targetAudience: 'For serious candidates targeting top scores',
    monthlyPriceUsd: 39,
    quarterlyPriceUsd: 99,
    annualPriceUsd: 329,
    featuresJson: [
      'Unlimited practice bank access across all 5 exams',
      '60 AI speaking & writing evaluations per day',
      'Unlimited timed full-length & adaptive mock tests',
      'Personalized AI study plans & AI Personal Tutor',
      'PDF, Excel & CSV official-style diagnostic reports',
    ],
    limitsJson: { dailyPractice: 9999, dailyAiScoring: 60, fullMocksPerMonth: 999, seats: 1 },
  },
  {
    code: 'professional',
    name: 'Professional Intensive',
    targetAudience: 'For rapid exam-day mastery & priority AI',
    monthlyPriceUsd: 69,
    quarterlyPriceUsd: 179,
    annualPriceUsd: 599,
    featuresJson: [
      'Everything in Premium Achiever',
      'Priority low-latency AI scoring & extended audio sessions',
      'Unlimited AI Tutor & deep pronunciation drills',
      'Custom mock test builder & downloadable score transcripts',
    ],
    limitsJson: { dailyPractice: 9999, dailyAiScoring: 200, fullMocksPerMonth: 999, seats: 1 },
  },
  {
    code: 'institutional',
    name: 'Institutional Academy',
    targetAudience: 'For language schools, coaching centers & universities',
    monthlyPriceUsd: 199,
    quarterlyPriceUsd: 529,
    annualPriceUsd: 1799,
    featuresJson: [
      'Up to 50 student seats (scalable on demand)',
      'Teacher & Organization Manager dashboards',
      'Live WebSocket group sessions, assignments & leaderboards',
      'White-label PDF/Excel cohort reports & centralized billing',
    ],
    limitsJson: { dailyPractice: 9999, dailyAiScoring: 500, fullMocksPerMonth: 999, seats: 50 },
  },
];

let seedPromise: Promise<void> | null = null;
let seeded = false;

export async function ensureDatabaseSeeded(): Promise<void> {
  if (seeded) return;
  if (seedPromise) return seedPromise;

  seedPromise = (async () => {
    try {
      // 1. Seed subscription plans idempotently
      for (const plan of SEED_PLANS) {
        await db.insert(subscriptionPlans).values(plan).onConflictDoNothing({ target: subscriptionPlans.code });
      }

      // 2. Seed promo coupons idempotently
      await db
        .insert(coupons)
        .values([
          { code: 'LAUNCH25', discountType: 'percent', discountValue: 25, maxRedemptions: 1000, isActive: true },
          { code: 'ACADEMY40', discountType: 'percent', discountValue: 40, maxRedemptions: 250, isActive: true },
        ])
        .onConflictDoNothing({ target: coupons.code });

      // 3. Seed exams, versions, sections, question types
      const typeCodeToId = new Map<string, number>();
      const examCodeToVersionId = new Map<string, number>();

      for (const spec of EXAM_LIST) {
        await db
          .insert(exams)
          .values({
            code: spec.code,
            name: spec.name,
            providerLabel: spec.providerLabel,
            scoreScaleMin: spec.scoreScaleMin,
            scoreScaleMax: spec.scoreScaleMax,
            scoreStep: spec.scoreStep,
            description: spec.description,
          })
          .onConflictDoNothing({ target: exams.code });

        const [examRow] = await db.select().from(exams).where(eq(exams.code, spec.code)).limit(1);
        if (!examRow) continue;

        let [verRow] = await db.select().from(examVersions).where(eq(examVersions.examId, examRow.id)).limit(1);
        if (!verRow) {
          [verRow] = await db
            .insert(examVersions)
            .values({
              examId: examRow.id,
              versionTag: spec.versionTag,
              effectiveDate: spec.effectiveDate,
              scoringConfigJson: {
                scaleMin: spec.scoreScaleMin,
                scaleMax: spec.scoreScaleMax,
                step: spec.scoreStep,
              },
              timingConfigJson: { sections: spec.sections },
              isCurrent: true,
            })
            .returning();
        }
        examCodeToVersionId.set(spec.code, verRow.id);

        const existingSections = await db.select().from(sections).where(eq(sections.examVersionId, verRow.id));
        const secMap = new Map<string, number>();
        for (const s of existingSections) secMap.set(s.code, s.id);

        for (let i = 0; i < spec.sections.length; i++) {
          const sDef = spec.sections[i];
          if (!secMap.has(sDef.code)) {
            const [insSec] = await db
              .insert(sections)
              .values({
                examVersionId: verRow.id,
                code: sDef.code,
                name: sDef.name,
                displayOrder: i + 1,
                defaultDurationSec: sDef.defaultDurationSec,
              })
              .returning();
            secMap.set(sDef.code, insSec.id);
          }
        }

        for (let i = 0; i < spec.questionTypes.length; i++) {
          const qt = spec.questionTypes[i];
          const sectionId = secMap.get(qt.sectionCode);
          if (!sectionId) continue;

          const existingQts = await db.select().from(questionTypes).where(eq(questionTypes.sectionId, sectionId));
          const match = existingQts.find((q) => q.code === qt.code);
          if (match) {
            typeCodeToId.set(`${spec.code}:${qt.code}`, match.id);
          } else {
            const [insQt] = await db
              .insert(questionTypes)
              .values({
                sectionId,
                code: qt.code,
                name: qt.name,
                description: qt.description,
                prepTimeSec: qt.prepTimeSec,
                responseTimeSec: qt.responseTimeSec,
                scoringMode: qt.scoringMode,
                rubricConfigJson: { traits: qt.rubricTraits, uiMechanic: qt.uiMechanic },
                displayOrder: i + 1,
              })
              .returning();
            typeCodeToId.set(`${spec.code}:${qt.code}`, insQt.id);
          }
        }
      }

      // 4. Seed original question bank idempotently
      const questionIdByExam = new Map<string, Array<{ id: number; sectionCode: string }>>();
      for (const q of ORIGINAL_QUESTIONS) {
        const questionTypeId = typeCodeToId.get(`${q.examCode}:${q.typeCode}`) || null;
        await db
          .insert(questions)
          .values({
            externalCode: q.externalCode,
            questionTypeId,
            examCode: q.examCode,
            sectionCode: q.sectionCode,
            typeCode: q.typeCode,
            title: q.title,
            difficulty: q.difficulty,
            topic: q.topic,
            promptText: q.promptText,
            stimulusJson: q.stimulusJson,
            mediaJson: q.mediaJson,
            answerKeyJson: q.answerKeyJson,
            acceptedVariantsJson: q.acceptedVariantsJson || [],
            explanation: q.explanation,
            scoringConfigJson: q.scoringConfigJson || {},
            sourceLicense: 'LexiScore Original Content (v1)',
            status: 'published',
          })
          .onConflictDoNothing({ target: questions.externalCode });
      }

      const allQs = await db.select({ id: questions.id, examCode: questions.examCode, sectionCode: questions.sectionCode }).from(questions);
      for (const row of allQs) {
        const arr = questionIdByExam.get(row.examCode) || [];
        arr.push({ id: row.id, sectionCode: row.sectionCode });
        questionIdByExam.set(row.examCode, arr);
      }

      // 5. Seed Full-Length & Sectional Mock Tests per exam
      for (const spec of EXAM_LIST) {
        const examQs = questionIdByExam.get(spec.code) || [];
        if (examQs.length === 0) continue;

        const fullCode = `MOCK-${spec.code.toUpperCase()}-FULL-1`;
        const [existingFull] = await db.select().from(mockTests).where(eq(mockTests.code, fullCode)).limit(1);
        if (!existingFull) {
          const [createdFull] = await db
            .insert(mockTests)
            .values({
              code: fullCode,
              examCode: spec.code,
              examVersionId: examCodeToVersionId.get(spec.code) || null,
              title: `${spec.name} — Full-Length Diagnostic Mock #1`,
              description: `Complete timed simulation spanning all ${spec.sections.map((s) => s.name).join(', ')} tasks with automated objective grading and AI rubric evaluation.`,
              mode: 'full',
              durationSec: spec.code === 'det' ? 2700 : 3600,
              isFree: true,
              status: 'published',
            })
            .returning();

          for (let idx = 0; idx < examQs.length; idx++) {
            await db.insert(mockTestQuestions).values({
              mockTestId: createdFull.id,
              questionId: examQs[idx].id,
              displayOrder: idx + 1,
              sectionCode: examQs[idx].sectionCode,
              weight: 1,
            });
          }
        }

        // Add sectional mocks for objective/fast-practice and speaking/writing focus
        for (const sec of spec.sections) {
          const secQs = examQs.filter((q) => q.sectionCode === sec.code);
          if (secQs.length === 0) continue;
          const secMockCode = `MOCK-${spec.code.toUpperCase()}-${sec.code.toUpperCase()}-1`;
          const [existingSec] = await db.select().from(mockTests).where(eq(mockTests.code, secMockCode)).limit(1);
          if (!existingSec) {
            const [createdSec] = await db
              .insert(mockTests)
              .values({
                code: secMockCode,
                examCode: spec.code,
                examVersionId: examCodeToVersionId.get(spec.code) || null,
                title: `${spec.name} — ${sec.name} Sectional Mock`,
                description: `Focused timed mock test targeting ${spec.name} ${sec.name} tasks (${secQs.length} items).`,
                mode: 'sectional',
                sectionFilter: sec.code,
                durationSec: Math.min(sec.defaultDurationSec, Math.max(600, secQs.length * 240)),
                isFree: true,
                status: 'published',
              })
              .returning();

            for (let idx = 0; idx < secQs.length; idx++) {
              await db.insert(mockTestQuestions).values({
                mockTestId: createdSec.id,
                questionId: secQs[idx].id,
                displayOrder: idx + 1,
                sectionCode: sec.code,
                weight: 1,
              });
            }
          }
        }
      }

      seeded = true;
    } catch (error) {
      seedPromise = null;
      console.error('Database seed failed:', error);
      throw error;
    }
  })();

  return seedPromise;
}
