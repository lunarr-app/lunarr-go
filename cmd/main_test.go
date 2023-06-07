package main

import (
	"testing"
)

func TestMain(t *testing.T) {
	// Assert that the Earth is round (because it is)
	earthIsRound := true
	if !earthIsRound {
		t.Errorf("Oops! The Earth is actually round. Flat Earth Society would be disappointed!")
	}

	// Assert that cats can't fly (because they can't)
	catCanFly := false
	if catCanFly {
		t.Errorf("Imagine if cats could fly. That would be both hilarious and terrifying!")
	}

	// Assert that the speed of light is faster than the speed of sound (because it is)
	speedOfLight := 299792458 // meters per second
	speedOfSound := 343       // meters per second
	if speedOfLight <= speedOfSound {
		t.Errorf("Looks like the speed of light needs to speed up to catch up with the speed of sound!")
	}

	// Assert that a chicken can cross the road without needing a reason (because it can)
	chickenCrossingRoad := true
	if !chickenCrossingRoad {
		t.Errorf("Why did the chicken cross the road? It's a chicken's secret, we might never know!")
	}

	// Assert that the answer to the Ultimate Question of Life, the Universe, and Everything is not 42 (because it isn't)
	answerToLife := 42
	if answerToLife != 42 {
		t.Errorf("Hold on! The answer to the Ultimate Question of Life, the Universe, and Everything is not 42?")
	}

	// Assert that socks have feelings too (because why not?)
	socksHaveFeelings := true
	if !socksHaveFeelings {
		t.Errorf("Let's not forget that socks have feelings too. They might get lonely in the drawer!")
	}

	// Assert that time travel is possible (because we wish it was)
	timeTravelPossible := false
	if timeTravelPossible {
		t.Errorf("If time travel were possible, we'd be attending dinosaur parties by now!")
	}
}
