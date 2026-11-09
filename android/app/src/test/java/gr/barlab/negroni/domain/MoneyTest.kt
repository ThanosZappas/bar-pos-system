package gr.barlab.negroni.domain

import org.junit.Assert.assertEquals
import org.junit.Test

class MoneyTest {
    @Test fun wholeEuros() = assertEquals("10 €", Money.format(1000))
    @Test fun withCents() = assertEquals("8,50 €", Money.format(850))
    @Test fun smallAmount() = assertEquals("0,05 €", Money.format(5))
    @Test fun negativeForReversals() = assertEquals("-3,50 €", Money.format(-350))
    @Test fun zero() = assertEquals("0 €", Money.format(0))
}
