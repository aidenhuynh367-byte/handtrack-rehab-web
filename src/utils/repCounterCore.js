export const HOLD_TIME_MS = 600
export const TARGET_FRAME_REQUIREMENT = 5

export function createCycleRepCounter({
  targetReps,
  targetSets,
  initialPhase,
  activePhase,
  holdPhase,
  completePhase,
  activeInstruction,
  holdInstruction,
  releaseInstruction,
  setCompleteInstruction = 'Start next set when ready',
  holdTimeMs = HOLD_TIME_MS,
  targetFrameRequirement = TARGET_FRAME_REQUIREMENT,
  getMeasurement,
  isActive,
  isReleased,
  getRangeScore,
  getDebugState,
  earlyReleaseInstruction = activeInstruction,
  countEarlyReleaseAsInvalid = true,
}) {
  const state = {
    phase: initialPhase,
    holdStartedAt: null,
    repStartedAt: null,
    targetReachedAt: null,
    minMeasurementInRep: null,
    targetFrames: 0,
    repsInSet: 0,
    repsCompleted: 0,
    setsCompleted: 0,
    instruction: activeInstruction,
    measurement: null,
    justCounted: false,
    setComplete: false,
    complete: false,
    debug: null,
    retryAfterEarlyRelease: false,
    metrics: {
      attemptedReps: 0,
      validReps: 0,
      invalidReps: 0,
      correctStateTransitions: 0,
      totalStateTransitions: 0,
      repDurationsMs: [],
      holdDurationsMs: [],
      timeToTargetMs: [],
      releaseSuccesses: 0,
      targetContactSuccesses: 0,
      minTargetDistances: [],
      rangeScoresByRep: [],
      targetHoldMs: holdTimeMs,
    },
  }

  const resetGesture = () => {
    state.phase = initialPhase
    state.holdStartedAt = null
    state.repStartedAt = null
    state.targetReachedAt = null
    state.minMeasurementInRep = null
    state.targetFrames = 0
    state.instruction = activeInstruction
    state.measurement = null
    state.justCounted = false
    state.retryAfterEarlyRelease = false
  }

  const recordTransition = () => {
    state.metrics.correctStateTransitions += 1
    state.metrics.totalStateTransitions += 1
  }

  const recordInvalidRep = () => {
    if (state.phase === initialPhase) {
      return
    }

    state.metrics.invalidReps += 1
    state.metrics.totalStateTransitions += 1
  }

  const updateMinimumMeasurement = (measurement) => {
    if (!Number.isFinite(measurement)) {
      return
    }

    state.minMeasurementInRep =
      state.minMeasurementInRep === null
        ? measurement
        : Math.min(state.minMeasurementInRep, measurement)
  }

  const countRep = (timestamp) => {
    state.metrics.validReps += 1
    state.metrics.releaseSuccesses += 1
    state.metrics.repDurationsMs.push(timestamp - (state.repStartedAt ?? timestamp))
    state.metrics.holdDurationsMs.push(timestamp - (state.holdStartedAt ?? timestamp))

    if (Number.isFinite(state.minMeasurementInRep)) {
      state.metrics.minTargetDistances.push(state.minMeasurementInRep)

      if (getRangeScore) {
        state.metrics.rangeScoresByRep.push(getRangeScore(state.minMeasurementInRep))
      }
    }

    recordTransition()
    state.repsInSet += 1
    state.repsCompleted += 1
    state.justCounted = true

    if (state.repsInSet >= targetReps) {
      state.setsCompleted += 1
      state.setComplete = true
      state.phase = completePhase
      state.instruction =
        state.setsCompleted >= targetSets ? 'Exercise complete' : setCompleteInstruction
      state.complete = state.setsCompleted >= targetSets
      return
    }

    resetGesture()
    state.justCounted = true
  }

  return {
    update(landmarks, timestamp) {
      state.justCounted = false

      if (state.setComplete || state.complete) {
        return this.getState()
      }

      const measurement = getMeasurement(landmarks)
      state.measurement = measurement
      state.debug = getDebugState?.(landmarks, measurement) ?? null

      if (!Number.isFinite(measurement)) {
        recordInvalidRep()
        resetGesture()
        state.instruction = 'Hold your hand steady in view'
        return this.getState()
      }

      updateMinimumMeasurement(measurement)

      if (state.phase === initialPhase) {
        if (isActive(measurement, landmarks)) {
          state.retryAfterEarlyRelease = false

          if (state.targetFrames === 0) {
            state.repStartedAt = timestamp
            state.minMeasurementInRep = measurement
          }

          state.targetFrames += 1

          if (state.targetFrames >= targetFrameRequirement) {
            state.phase = activePhase
            state.holdStartedAt = timestamp
            state.targetReachedAt = timestamp
            state.metrics.attemptedReps += 1
            state.metrics.targetContactSuccesses += 1
            state.metrics.timeToTargetMs.push(timestamp - (state.repStartedAt ?? timestamp))
            recordTransition()
            state.instruction = holdInstruction
          }
        } else {
          state.targetFrames = 0
          state.repStartedAt = null
          state.minMeasurementInRep = null
          state.instruction = state.retryAfterEarlyRelease
            ? earlyReleaseInstruction
            : activeInstruction
        }
      } else if (state.phase === activePhase) {
        if (isReleased(measurement, landmarks)) {
          // early release means they moved too fast, not always a failed rep
          if (countEarlyReleaseAsInvalid) {
            recordInvalidRep()
          }

          resetGesture()
          state.retryAfterEarlyRelease = true
          state.instruction = earlyReleaseInstruction
        } else if (timestamp - state.holdStartedAt >= holdTimeMs) {
          state.phase = holdPhase
          recordTransition()
          state.instruction = releaseInstruction
        } else {
          state.instruction = holdInstruction
        }
      } else if (state.phase === holdPhase) {
        if (isReleased(measurement, landmarks)) {
          countRep(timestamp)
        } else {
          state.instruction = releaseInstruction
        }
      }

      return this.getState()
    },

    reset({ keepProgress = false } = {}) {
      recordInvalidRep()
      state.phase = initialPhase
      state.holdStartedAt = null
      state.repStartedAt = null
      state.targetReachedAt = null
      state.minMeasurementInRep = null
      state.targetFrames = 0
      state.instruction = activeInstruction
      state.measurement = null
      state.justCounted = false
      state.setComplete = false
      state.complete = false
      state.retryAfterEarlyRelease = false

      if (!keepProgress) {
        state.repsInSet = 0
        state.repsCompleted = 0
        state.setsCompleted = 0
        state.metrics = {
          attemptedReps: 0,
          validReps: 0,
          invalidReps: 0,
          correctStateTransitions: 0,
          totalStateTransitions: 0,
          repDurationsMs: [],
          holdDurationsMs: [],
          timeToTargetMs: [],
          releaseSuccesses: 0,
          targetContactSuccesses: 0,
          minTargetDistances: [],
          rangeScoresByRep: [],
          targetHoldMs: holdTimeMs,
        }
      }
    },

    startNextSet() {
      state.repsInSet = 0
      state.setComplete = false
      state.complete = false
      resetGesture()
    },

    getState() {
      return {
        ...state,
        isStartPhase: state.phase === initialPhase,
        sessionMetrics: {
          ...state.metrics,
          repDurationsMs: [...state.metrics.repDurationsMs],
          holdDurationsMs: [...state.metrics.holdDurationsMs],
          timeToTargetMs: [...state.metrics.timeToTargetMs],
          minTargetDistances: [...state.metrics.minTargetDistances],
          rangeScoresByRep: [...state.metrics.rangeScoresByRep],
        },
      }
    },

    get repsCompleted() {
      return state.repsCompleted
    },

    get setsCompleted() {
      return state.setsCompleted
    },

    get instruction() {
      return state.instruction
    },

    get phase() {
      return state.phase
    },
  }
}
