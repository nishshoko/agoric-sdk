import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';

export function buildRootObject() {
  let vatAdmin;
  let root;
  const sensor0 = Far(`sensor-0`, {});
  const sensor1 = Far(`sensor-1`, {});

  return Far('root', {
    async bootstrap(vats, devices) {
      vatAdmin = await E(vats.vatAdmin).createVatAdminService(devices.vatAdmin);
    },

    async build() {
      // build the target vat
      const bcap = await E(vatAdmin).getNamedBundleCap('dri');
      const options = {};
      options.virtualObjectCacheSize = 0;
      const res = await E(vatAdmin).createVat(bcap, options);
      root = res.root;
      await E(root).buildVir(sensor0, sensor1);
      await E(root).ping();
      return 'ok';
    },
  });
}
