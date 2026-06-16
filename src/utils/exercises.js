import { createClosedFistRepCounter } from './closedFistRepCounter.js'
import { createRingPalmRepCounter } from './ringPalmRepCounter.js'
import { createRingThumbRepCounter } from './ringThumbRepCounter.js'

const START_IMAGE_SOURCES = [
  '/exemplary_images/Exercise_start.png',
  '/exemplary_images/Excersice_start.png',
]

export const EXERCISES = [
  {
    id: 'ring-thumb',
    name: 'Ring Finger to Thumb Touch',
    description: 'Touch ring finger to thumb with a brief controlled hold.',
    targetAlt: 'Ring finger touching thumb target position',
    demoImages: {
      start: START_IMAGE_SOURCES,
      target: ['/exemplary_images/ring_thumb_target.png'],
    },
    demoSteps: [
      'Start with hand open',
      'Touch ring finger to thumb',
      'Hold briefly',
      'Release back to open',
    ],
    createCounter: createRingThumbRepCounter,
  },
  {
    id: 'ring-palm',
    name: 'Ring Finger to Palm Touch',
    description: 'Bend ring finger toward the palm and return to extension.',
    targetAlt: 'Ring finger bent toward palm target position',
    demoImages: {
      start: START_IMAGE_SOURCES,
      target: ['/exemplary_images/ring_palm_target.png'],
    },
    demoSteps: [
      'Start with hand open',
      'Bend ring finger toward palm',
      'Hold briefly',
      'Straighten ring finger again',
    ],
    createCounter: createRingPalmRepCounter,
  },
  {
    id: 'closed-fist',
    name: 'Closed Fist Exercise',
    description: 'Close all fingers into a fist, hold briefly, then reopen.',
    targetAlt: 'Closed fist target position',
    demoImages: {
      start: START_IMAGE_SOURCES,
      target: ['/exemplary_images/closed_fist_target.png'],
    },
    demoSteps: [
      'Start with hand open',
      'Bend fingers into a closed fist',
      'Hold briefly',
      'Open hand again',
    ],
    createCounter: createClosedFistRepCounter,
  },
]

export function getExerciseById(exerciseId) {
  return EXERCISES.find((exercise) => exercise.id === exerciseId) ?? EXERCISES[0]
}
