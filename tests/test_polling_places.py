import importlib.util
import tempfile
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location("polling",Path(__file__).parents[1]/"scripts"/"prepare-polling-places.py")
polling=importlib.util.module_from_spec(spec);spec.loader.exec_module(polling)
def row(**overrides):
    base={"ANO_ELEICAO":"2026","NR_TURNO":"2","SG_UF":"GO","CD_MUNICIPIO":"94730",
          "NM_MUNICIPIO":"MORRINHOS","NR_ZONA":"22","NR_SECAO":"1","NR_LOCAL_VOTACAO":"1000",
          "NM_LOCAL_VOTACAO":"ESCOLA A","DS_ENDERECO":"RUA A","NR_LATITUDE":"-17,7","NR_LONGITUDE":"-49,1"}
    return {**base,**overrides}
class ImportTests(unittest.TestCase):
    def test_group_and_turns(self):
        cities=polling.build_rows([row(),row(),row(NR_SECAO="2"),row(NR_TURNO="1",NM_LOCAL_VOTACAO="ESCOLA ANTERIOR")])
        self.assertEqual(len(cities),2)
        p=cities[("2","go","94730")]["places"]["0022/1000"]
        self.assertEqual(p["sections"],{"0001","0002"})
        self.assertEqual(p["coordinates"],[-49.1,-17.7])
    def test_missing_coordinates_and_zone_identity(self):
        cities=polling.build_rows([row(NR_LATITUDE="0",NR_LONGITUDE="0"),row(NR_ZONA="23",NR_LATITUDE="#NULO#")])
        places=cities[("2","go","94730")]["places"]
        self.assertEqual(len(places),2)
        self.assertTrue(all(p["coordinates"] is None for p in places.values()))
    def test_conflicting_coordinates_are_not_presented_as_exact(self):
        cities=polling.build_rows([row(),row(NR_SECAO="2",NR_LATITUDE="-18")])
        self.assertIsNone(cities[("2","go","94730")]["places"]["0022/1000"]["coordinates"])
    def test_output_has_separate_turn_files(self):
        cities=polling.build_rows([row(),row(NR_TURNO="1")])
        with tempfile.TemporaryDirectory() as directory:
            output=Path(directory);meta=polling.write_cities(cities,output)
            self.assertEqual(meta["turns"],["1","2"])
            self.assertTrue((output/"2"/"go"/"94730.json").exists())
            self.assertTrue((output/"1"/"go"/"94730.json").exists())
    def test_rejects_year_and_turn_errors(self):
        self.assertFalse(polling.build_rows([row(ANO_ELEICAO="2024")]))
        with self.assertRaises(ValueError):polling.build_rows([row(NR_TURNO="0")])
if __name__=="__main__":unittest.main()
