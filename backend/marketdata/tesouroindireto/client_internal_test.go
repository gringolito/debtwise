package tesouroindireto

import (
	"net/http"
	"net/url"
	"testing"
	"testing/synctest"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// hangingTransport answers no request: each waits until its context is done.
type hangingTransport struct{}

func (hangingTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	<-r.Context().Done()

	return nil, r.Context().Err()
}

func TestBondsGivesUpAtTheTimeout(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		client := New("http://tesouro-indireto.test", "ti_secret", WithTimeout(20*time.Millisecond))
		client.http.Transport = hangingTransport{}
		start := time.Now()

		_, err := client.Bonds(t.Context())

		var urlErr *url.Error
		require.ErrorAs(t, err, &urlErr)
		assert.True(t, urlErr.Timeout(), "error: %v", err)
		assert.Equal(t, 20*time.Millisecond, time.Since(start))
	})
}
