package keeper

import (
	"reflect"
	"testing"

	"github.com/Agoric/agoric-sdk/golang/cosmos/x/vstorage/types"

	"github.com/cosmos/cosmos-sdk/store"
	storetypes "github.com/cosmos/cosmos-sdk/store/types"
	sdk "github.com/cosmos/cosmos-sdk/types"

	"github.com/tendermint/tendermint/libs/log"
	tmproto "github.com/tendermint/tendermint/proto/tendermint/types"
	dbm "github.com/tendermint/tm-db"
)

var (
	vstorageStoreKey = storetypes.NewKVStoreKey(types.StoreKey)
)

type testKit struct {
	ctx            sdk.Context
	vstorageKeeper Keeper
}

func makeTestKit() testKit {
	keeper := NewKeeper(vstorageStoreKey)

	db := dbm.NewMemDB()
	ms := store.NewCommitMultiStore(db)
	ms.MountStoreWithDB(vstorageStoreKey, sdk.StoreTypeIAVL, db)
	err := ms.LoadLatestVersion()
	if err != nil {
		panic(err)
	}
	ctx := sdk.NewContext(ms, tmproto.Header{}, false, log.NewNopLogger())

	return testKit{ctx, keeper}
}

func childrenEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestStorage(t *testing.T) {
	testKit := makeTestKit()
	ctx, keeper := testKit.ctx, testKit.vstorageKeeper

	// Test that we can store and retrieve a value.
	keeper.SetStorage(ctx, "inited", "initValue")
	if got := keeper.GetData(ctx, "inited"); got != "initValue" {
		t.Errorf("got %q, want %q", got, "initValue")
	}

	// Test that unknown children return empty string.
	if got := keeper.GetData(ctx, "unknown"); got != "" {
		t.Errorf("got %q, want empty string", got)
	}

	// Check that our children are updated as expected.
	if got := keeper.GetChildren(ctx, ""); !childrenEqual(got.Children, []string{"inited"}) {
		t.Errorf("got %q children, want [inited]", got.Children)
	}

	keeper.SetStorage(ctx, "key1", "value1")
	if got := keeper.GetChildren(ctx, ""); !childrenEqual(got.Children, []string{"inited", "key1"}) {
		t.Errorf("got %q children, want [inited,key1]", got.Children)
	}

	// Check alphabetical.
	keeper.SetStorage(ctx, "alpha2", "value2")
	if got := keeper.GetChildren(ctx, ""); !childrenEqual(got.Children, []string{"alpha2", "inited", "key1"}) {
		t.Errorf("got %q children, want [alpha2,inited,key1]", got.Children)
	}

	keeper.SetStorage(ctx, "beta3", "value3")
	if got := keeper.GetChildren(ctx, ""); !childrenEqual(got.Children, []string{"alpha2", "beta3", "inited", "key1"}) {
		t.Errorf("got %q children, want [alpha2,beta3,inited,key1]", got.Children)
	}

	if got := keeper.GetChildren(ctx, "nonexistent"); !childrenEqual(got.Children, []string{}) {
		t.Errorf("got %q children, want []", got.Children)
	}

	// Check adding children.
	keeper.SetStorage(ctx, "key1.child1", "value1child")
	if got := keeper.GetData(ctx, "key1.child1"); got != "value1child" {
		t.Errorf("got %q, want %q", got, "value1child")
	}

	if got := keeper.GetChildren(ctx, "key1"); !childrenEqual(got.Children, []string{"child1"}) {
		t.Errorf("got %q children, want [child1]", got.Children)
	}

	// Add a grandchild.
	keeper.SetStorage(ctx, "key1.child1.grandchild1", "value1grandchild")
	if got := keeper.GetData(ctx, "key1.child1.grandchild1"); got != "value1grandchild" {
		t.Errorf("got %q, want %q", got, "value1grandchild")
	}

	if got := keeper.GetChildren(ctx, "key1.child1"); !childrenEqual(got.Children, []string{"grandchild1"}) {
		t.Errorf("got %q children, want [grandchild1]", got.Children)
	}

	// Delete the child's contents.
	keeper.SetStorage(ctx, "key1.child1", "")
	if got := keeper.GetChildren(ctx, "key1"); !childrenEqual(got.Children, []string{"child1"}) {
		t.Errorf("got %q children, want [child1]", got.Children)
	}

	if got := keeper.GetChildren(ctx, "key1.child1"); !childrenEqual(got.Children, []string{"grandchild1"}) {
		t.Errorf("got %q children, want [grandchild1]", got.Children)
	}

	// Delete the grandchild's contents.
	keeper.SetStorage(ctx, "key1.child1.grandchild1", "")
	if got := keeper.GetChildren(ctx, "key1.child1"); !childrenEqual(got.Children, []string{}) {
		t.Errorf("got %q children, want []", got.Children)
	}
	// Removing that node rolls up into the parent.
	if got := keeper.GetChildren(ctx, "key1"); !childrenEqual(got.Children, []string{}) {
		t.Errorf("got %q children, want []", got.Children)
	}

	// See about deleting the parent.
	keeper.SetStorage(ctx, "key1", "")
	if got := keeper.GetChildren(ctx, ""); !childrenEqual(got.Children, []string{"alpha2", "beta3", "inited"}) {
		t.Errorf("got %q children, want [alpha2,beta3,inited]", got.Children)
	}

	// Do a deep set.
	keeper.SetStorage(ctx, "key2.child2.grandchild2", "value2grandchild")
	if got := keeper.GetChildren(ctx, ""); !childrenEqual(got.Children, []string{"alpha2", "beta3", "inited", "key2"}) {
		t.Errorf("got %q children, want [alpha2,beta3,inited,key2]", got.Children)
	}
	if got := keeper.GetChildren(ctx, "key2.child2"); !childrenEqual(got.Children, []string{"grandchild2"}) {
		t.Errorf("got %q children, want [grandchild2]", got.Children)
	}
	if got := keeper.GetChildren(ctx, "key2"); !childrenEqual(got.Children, []string{"child2"}) {
		t.Errorf("got %q children, want [child2]", got.Children)
	}

	// Do another deep set.
	keeper.SetStorage(ctx, "key2.child2.grandchild2a", "value2grandchilda")
	if got := keeper.GetChildren(ctx, "key2.child2"); !childrenEqual(got.Children, []string{"grandchild2", "grandchild2a"}) {
		t.Errorf("got %q children, want [grandchild2,grandchild2a]", got.Children)
	}

	// Check the export.
	expectedExport := []*types.DataEntry{
		{Path: "alpha2", Value: "value2"},
		{Path: "beta3", Value: "value3"},
		{Path: "inited", Value: "initValue"},
		{Path: "key2.child2.grandchild2", Value: "value2grandchild"},
		{Path: "key2.child2.grandchild2a", Value: "value2grandchilda"},
	}
	got := keeper.ExportStorage(ctx)
	if !reflect.DeepEqual(got, expectedExport) {
		t.Errorf("got export %q, want %q", got, expectedExport)
	}
	keeper.ImportStorage(ctx, got)
}
