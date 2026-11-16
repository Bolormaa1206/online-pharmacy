import tempfile
import unittest

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

import main


class PharmacyWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        database = f"sqlite:///{self.temp_dir.name}/test.db"
        self.engine = create_engine(database, connect_args={"check_same_thread": False})
        main.Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(self.engine, expire_on_commit=False)

        with self.Session() as session:
            pharmacy_a = main.Pharmacy(name='A', address='A address', lat=47.9, lng=106.9)
            pharmacy_b = main.Pharmacy(name='B', address='B address', lat=47.8, lng=106.8)
            medicine_a = main.Medicine(name='Medicine A', category='Test')
            medicine_b = main.Medicine(name='Medicine B', category='Test')
            medicine_rx = main.Medicine(name='Prescription Medicine', category='Test', prescription_required=True)
            session.add_all([pharmacy_a, pharmacy_b, medicine_a, medicine_b, medicine_rx])
            session.flush()
            session.add_all([
                main.Inventory(pharmacy_id=pharmacy_a.id, medicine_id=medicine_a.id, price=1000, stock=3, expiry='2099-01-01'),
                main.Inventory(pharmacy_id=pharmacy_a.id, medicine_id=medicine_b.id, price=2000, stock=2, expiry='2099-01-01'),
                main.Inventory(pharmacy_id=pharmacy_a.id, medicine_id=medicine_rx.id, price=3000, stock=4, expiry='2099-01-01'),
                main.Inventory(pharmacy_id=pharmacy_b.id, medicine_id=medicine_a.id, price=1100, stock=5, expiry='2099-01-01'),
            ])
            self.customer = main.User(name='Customer', email='customer@test.mn', password_hash='test', role='customer')
            self.staff_a = main.User(name='Staff A', email='staff-a@test.mn', password_hash='test', role='staff', pharmacy_id=pharmacy_a.id)
            self.staff_b = main.User(name='Staff B', email='staff-b@test.mn', password_hash='test', role='staff', pharmacy_id=pharmacy_b.id)
            self.doctor = main.User(name='Doctor', email='doctor@test.mn', password_hash='test', role='doctor')
            self.admin = main.User(name='Admin', email='admin@test.mn', password_hash='test', role='admin')
            session.add_all([self.customer, self.staff_a, self.staff_b, self.doctor, self.admin])
            session.commit()
            self.pharmacy_a_id = pharmacy_a.id
            self.pharmacy_b_id = pharmacy_b.id
            self.medicine_a_id = medicine_a.id
            self.medicine_b_id = medicine_b.id
            self.medicine_rx_id = medicine_rx.id
            self.customer_id = self.customer.id
            self.staff_a_id = self.staff_a.id
            self.staff_b_id = self.staff_b.id
            self.doctor_id = self.doctor.id
            self.admin_id = self.admin.id

    def tearDown(self):
        self.engine.dispose()
        self.temp_dir.cleanup()

    def test_registration_rejects_blank_name_and_invalid_email(self):
        with self.assertRaises(ValidationError):
            main.Register(name='  ', email='not-an-email', password='12345678')

    def test_staff_only_sees_and_changes_own_pharmacy(self):
        with self.Session() as session:
            customer = session.get(main.User, self.customer_id)
            created = main.checkout(
                main.Checkout(items=[
                    main.CartItem(pharmacy_id=self.pharmacy_a_id, medicine_id=self.medicine_a_id, quantity=2),
                    main.CartItem(pharmacy_id=self.pharmacy_b_id, medicine_id=self.medicine_a_id, quantity=1),
                ]),
                customer,
                session,
            )
            order_a = next(order for order in created if order['pharmacy_id'] == self.pharmacy_a_id)
            order_b = next(order for order in created if order['pharmacy_id'] == self.pharmacy_b_id)

        with self.Session() as session:
            staff_a = session.get(main.User, self.staff_a_id)
            visible = main.staff_orders(staff_a, session)
            self.assertEqual([order_a['id']], [order['id'] for order in visible])
            approved = main.decide(order_a['id'], 'approve', staff_a, session)
            self.assertEqual('approved', approved['status'])

        with self.Session() as session:
            stock = session.scalar(select(main.Inventory).where(
                main.Inventory.pharmacy_id == self.pharmacy_a_id,
                main.Inventory.medicine_id == self.medicine_a_id,
            ))
            self.assertEqual(1, stock.stock)
            staff_a = session.get(main.User, self.staff_a_id)
            with self.assertRaises(HTTPException) as duplicate:
                main.decide(order_a['id'], 'approve', staff_a, session)
            self.assertEqual(409, duplicate.exception.status_code)
            with self.assertRaises(HTTPException) as denied:
                main.decide(order_b['id'], 'approve', staff_a, session)
            self.assertEqual(404, denied.exception.status_code)

        with self.Session() as session:
            stock = session.scalar(select(main.Inventory).where(
                main.Inventory.pharmacy_id == self.pharmacy_a_id,
                main.Inventory.medicine_id == self.medicine_a_id,
            ))
            self.assertEqual(1, stock.stock)

    def test_failed_approval_rolls_back_all_stock_changes(self):
        with self.Session() as session:
            customer = session.get(main.User, self.customer_id)
            order = main.checkout(
                main.Checkout(items=[
                    main.CartItem(pharmacy_id=self.pharmacy_a_id, medicine_id=self.medicine_a_id, quantity=1),
                    main.CartItem(pharmacy_id=self.pharmacy_a_id, medicine_id=self.medicine_b_id, quantity=1),
                ]),
                customer,
                session,
            )[0]
            unavailable = session.scalar(select(main.Inventory).where(
                main.Inventory.pharmacy_id == self.pharmacy_a_id,
                main.Inventory.medicine_id == self.medicine_b_id,
            ))
            unavailable.stock = 0
            session.commit()

        with self.Session() as session:
            staff_a = session.get(main.User, self.staff_a_id)
            with self.assertRaises(HTTPException) as failed:
                main.decide(order['id'], 'approve', staff_a, session)
            self.assertEqual(409, failed.exception.status_code)

        with self.Session() as session:
            first_stock = session.scalar(select(main.Inventory).where(
                main.Inventory.pharmacy_id == self.pharmacy_a_id,
                main.Inventory.medicine_id == self.medicine_a_id,
            ))
            saved_order = session.get(main.Order, order['id'])
            self.assertEqual(3, first_stock.stock)
            self.assertEqual('pending', saved_order.status)

    def test_doctor_prescription_is_required_reserved_and_used(self):
        with self.Session() as session:
            customer = session.get(main.User, self.customer_id)
            with self.assertRaises(HTTPException) as missing:
                main.checkout(
                    main.Checkout(items=[main.CartItem(pharmacy_id=self.pharmacy_a_id, medicine_id=self.medicine_rx_id, quantity=1)]),
                    customer,
                    session,
                )
            self.assertEqual(400, missing.exception.status_code)

        with self.Session() as session:
            doctor = session.get(main.User, self.doctor_id)
            prescription = main.create_prescription(
                main.PrescriptionCreate(
                    patient_email='customer@test.mn',
                    valid_until='2099-01-01',
                    note='Test prescription',
                    items=[main.PrescriptionMedicineInput(medicine_id=self.medicine_rx_id, dosage='Өдөрт 2 удаа', quantity=2, instructions='Хоолны дараа')],
                ),
                doctor,
                session,
            )
            self.assertEqual('active', prescription['items'][0]['status'])

        with self.Session() as session:
            customer = session.get(main.User, self.customer_id)
            order = main.checkout(
                main.Checkout(items=[main.CartItem(pharmacy_id=self.pharmacy_a_id, medicine_id=self.medicine_rx_id, quantity=1)]),
                customer,
                session,
            )[0]
            mine = main.my_prescriptions(customer, session)
            self.assertEqual('reserved', mine[0]['items'][0]['status'])

        with self.Session() as session:
            staff = session.get(main.User, self.staff_a_id)
            main.decide(order['id'], 'approve', staff, session)

        with self.Session() as session:
            customer = session.get(main.User, self.customer_id)
            mine = main.my_prescriptions(customer, session)
            self.assertEqual('used', mine[0]['items'][0]['status'])
            with self.assertRaises(HTTPException):
                main.checkout(
                    main.Checkout(items=[main.CartItem(pharmacy_id=self.pharmacy_a_id, medicine_id=self.medicine_rx_id, quantity=1)]),
                    customer,
                    session,
                )

    def test_admin_summary_contains_system_counts(self):
        with self.Session() as session:
            admin = session.get(main.User, self.admin_id)
            summary = main.admin_summary(admin, session)
            self.assertEqual(5, summary['counts']['users'])
            self.assertEqual(1, summary['counts']['customers'])
            self.assertEqual(2, summary['counts']['pharmacies'])


if __name__ == '__main__':
    unittest.main()
